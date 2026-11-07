import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createHttpServer } from 'http';
import { URL } from 'url';
import { randomUUID } from 'crypto';
import {
  ClientMessageSchema,
  JoinMessageSchema,
  InputMessageSchema,
  StateMessageSchema,
  JoinedMessageSchema,
  LeftMessageSchema,
  HostMigratedMessageSchema,
  ErrorMessageSchema,
  type ClientMessage,
  type JoinMessage,
  type InputMessage,
  type StateMessage,
  type JoinedMessage,
  type LeftMessage,
  type HostMigratedMessage,
  type ErrorMessage,
  type Room,
  type ClientInfo,
  type ServerInstance
} from './types.js';

/**
 * Creates a WebSocket relay server for multiplayer rooms.
 * @param options - Server options
 * @param options.port - Port to listen on (default: 3001)
 * @returns Server instance with close() method and rooms map
 */
export function createServer(options: { port?: number } = {}): Promise<ServerInstance> {
  const port = options.port ?? 3001;

  // Room management: Map<roomCode, Room>
  const rooms = new Map<string, Room>();

  // Generate unique server-authoritative client ID
  function generateId(): string {
    return randomUUID();
  }

  // Broadcast message to all clients in a room except sender
  function broadcastToRoom(roomCode: string, message: object, excludeId: string | null = null): void {
    const room = rooms.get(roomCode);
    if (!room) return;

    const data = JSON.stringify(message);
    for (const [id, clientInfo] of room.clients) {
      if (id !== excludeId && clientInfo.ws.readyState === WebSocket.OPEN) {
        clientInfo.ws.send(data);
      }
    }
  }

  // Broadcast message to all clients in a room including sender
  function broadcastToAllInRoom(roomCode: string, message: object): void {
    const room = rooms.get(roomCode);
    if (!room) return;

    const data = JSON.stringify(message);
    for (const [, clientInfo] of room.clients) {
      if (clientInfo.ws.readyState === WebSocket.OPEN) {
        clientInfo.ws.send(data);
      }
    }
  }

  // Send error to a specific client
  function sendError(ws: WebSocket, code: string, message: string): Promise<void> {
    return new Promise((resolve) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', code, message } satisfies ErrorMessage), (err) => {
          if (err) console.error('Error sending error message:', err);
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // Start 30Hz tick interval for a room
  function startTickInterval(room: Room): void {
    if (room.tickInterval) return; // Already running
    room.tickInterval = setInterval(() => {
      room.tick++;
    }, 1000 / 30); // 30Hz = ~33.33ms
  }

  // Stop tick interval for a room
  function stopTickInterval(room: Room): void {
    if (room.tickInterval) {
      clearInterval(room.tickInterval);
      room.tickInterval = null;
    }
  }

  // Handle client joining a room
  function handleJoin(ws: WebSocket, roomCode: string, name: string): string {
    let room = rooms.get(roomCode);

    if (!room) {
      // First joiner becomes host - create room with server-generated ID
      const hostId = generateId();
      room = {
        code: roomCode,
        hostId,
        clients: new Map(),
        tick: 0,
        lastState: null,
        tickInterval: null
      };
      rooms.set(roomCode, room);
      startTickInterval(room);
    }

    // First joiner gets the pre-generated hostId, others get new IDs
    const isFirstJoiner = room.clients.size === 0;
    const clientId = isFirstJoiner ? room.hostId : generateId();

    // Notify new client about existing players in the room
    for (const [existingId, existingClient] of room.clients) {
      ws.send(JSON.stringify({
        type: 'joined',
        id: existingId,
        name: existingClient.name
      } satisfies JoinedMessage));
    }

    // Send current state to late joiner if available
    if (room.lastState) {
      ws.send(JSON.stringify({
        ...room.lastState,
        type: 'state' // Ensure type is correct
      } satisfies StateMessage));
    }

    // Create client info
    const clientInfo: ClientInfo = {
      ws,
      id: clientId,
      name,
      joinedAt: Date.now(),
      lastInputSeq: -1,
      inputRateLimit: { count: 0, windowStart: Date.now() }
    };

    room.clients.set(clientId, clientInfo);

    // Send joined confirmation to the joining client (with their assigned ID)
    ws.send(JSON.stringify({
      type: 'joined',
      id: clientId,
      name
    } satisfies JoinedMessage));

    // Notify others in room about new player
    broadcastToRoom(roomCode, {
      type: 'joined',
      id: clientId,
      name
    } satisfies JoinedMessage, clientId);

    return clientId;
  }

  // Handle client leaving a room
  function handleLeave(roomCode: string, clientId: string): void {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.clients.delete(clientId);

    // Broadcast left message to remaining clients
    broadcastToAllInRoom(roomCode, {
      type: 'left',
      id: clientId
    } satisfies LeftMessage);

    // Handle host migration if host left
    if (room.hostId === clientId) {
      if (room.clients.size > 0) {
        // Promote first remaining client as new host
        const newHostId = room.clients.keys().next().value!;
        room.hostId = newHostId;

        broadcastToAllInRoom(roomCode, {
          type: 'host-migrated',
          newHost: newHostId
        } satisfies HostMigratedMessage);
      } else {
        // Room is empty, clean up
        stopTickInterval(room);
        rooms.delete(roomCode);
      }
    }
  }

  // Check and update rate limit for input messages
  // Returns true if allowed, false if rate limited
  function checkRateLimit(clientInfo: ClientInfo): boolean {
    const now = Date.now();
    const windowMs = 1000; // 1 second window
    const maxPerWindow = 60; // 60 messages per second

    if (now - clientInfo.inputRateLimit.windowStart >= windowMs) {
      // Reset window
      clientInfo.inputRateLimit.windowStart = now;
      clientInfo.inputRateLimit.count = 1;
      return true;
    }

    if (clientInfo.inputRateLimit.count >= maxPerWindow) {
      return false;
    }

    clientInfo.inputRateLimit.count++;
    return true;
  }

  // Handle input message - relay to all other clients in room
  function handleInput(roomCode: string, clientId: string, message: InputMessage): void {
    const room = rooms.get(roomCode);
    if (!room) return;

    const clientInfo = room.clients.get(clientId);
    if (!clientInfo) return;

    // Rate limiting: max 60 input messages per second
    if (!checkRateLimit(clientInfo)) {
      sendError(clientInfo.ws, 'RATE_LIMIT_EXCEEDED', 'Input rate limit exceeded (max 60/s)');
      return;
    }

    // Optional: Validate sequence number is increasing (basic anti-replay)
    if (message.seq <= clientInfo.lastInputSeq) {
      // Allow but could log warning - for now just update
    }
    clientInfo.lastInputSeq = message.seq;

    broadcastToRoom(roomCode, {
      type: 'input',
      id: clientId,
      seq: message.seq,
      yaw: message.yaw,
      pitch: message.pitch,
      keys: message.keys,
      fire: message.fire
    } satisfies InputMessage, clientId);
  }

  // Handle state message - relay to all other clients in room
  function handleState(roomCode: string, clientId: string, message: StateMessage): void {
    const room = rooms.get(roomCode);
    if (!room) return;

    const clientInfo = room.clients.get(clientId);
    if (!clientInfo) return;

    // Only host can send state
    if (room.hostId !== clientId) {
      sendError(clientInfo.ws, 'NOT_HOST', 'Only host can send state updates');
      return;
    }

    // Store last state for late joiners
    room.lastState = message;

    // Use server's tick as authoritative timing reference, include sender ID
    const relayedState: StateMessage = {
      ...message,
      id: clientId,
      tick: room.tick // Override with server tick
    };

    broadcastToRoom(roomCode, relayedState, clientId);
  }

  // Validate client message using Zod schema
  function validateClientMessage(data: unknown): { success: true; message: ClientMessage } | { success: false; error: ErrorMessage } {
    const result = ClientMessageSchema.safeParse(data);
    if (!result.success) {
      const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      return {
        success: false,
        error: { type: 'error', code: 'VALIDATION_ERROR', message: `Invalid message: ${issues}` }
      };
    }
    return { success: true, message: result.data };
  }

  // Create HTTP server for WebSocket upgrade
  const httpServer = createHttpServer();

  // Configure WebSocketServer with 16KB max payload
  const wss = new WebSocketServer({ 
    server: httpServer,
    maxPayload: 16 * 1024 // 16KB
  });

  wss.on('connection', (ws: WebSocket, req) => {
    // Parse room code from query parameter
    const url = new URL(req.url ?? '', `http://localhost:${port}`);
    const roomCode = url.searchParams.get('room');

    if (!roomCode) {
      sendError(ws, 'MISSING_ROOM', 'Missing room parameter. Connect with ?room=CODE').then(() => {
        ws.close();
      });
      return;
    }

    let clientId: string | null = null;
    let hasJoined = false;

    // Handle incoming messages
    ws.on('message', (data: Buffer) => {
      try {
        const parsed = JSON.parse(data.toString());
        const validation = validateClientMessage(parsed);

        if (!validation.success) {
          sendError(ws, validation.error.code, validation.error.message);
          return;
        }

        const message = validation.message;

        switch (message.type) {
          case 'join': {
            const name = message.name ?? `Player${clientId?.slice(0, 4) ?? 'Unknown'}`;
            // IGNORE client-provided ID - server generates authoritative ID
            clientId = handleJoin(ws, roomCode, name);
            hasJoined = true;
            break;
          }

          case 'input': {
            if (!clientId || !hasJoined) {
              sendError(ws, 'NOT_JOINED', 'Must join room before sending input');
              return;
            }
            handleInput(roomCode, clientId, message);
            break;
          }

          case 'state': {
            if (!clientId || !hasJoined) {
              sendError(ws, 'NOT_JOINED', 'Must join room before sending state');
              return;
            }
            handleState(roomCode, clientId, message);
            break;
          }
        }
      } catch (err) {
        if (err instanceof SyntaxError) {
          sendError(ws, 'INVALID_JSON', 'Invalid JSON message');
        } else {
          console.error('Message handling error:', err);
          sendError(ws, 'INTERNAL_ERROR', 'Internal server error');
        }
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      if (hasJoined && clientId) {
        handleLeave(roomCode, clientId);
      }
    });

    // Handle errors
    ws.on('error', (err) => {
      console.error(`WebSocket error for client ${clientId}:`, err);
      if (hasJoined && clientId) {
        handleLeave(roomCode, clientId);
      }
    });
  });

  // Start server
  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      console.log(`WebSocket relay server running on port ${port}`);
      resolve({
        close: async () => {
          // Close all WebSocket connections
          for (const room of rooms.values()) {
            stopTickInterval(room);
            for (const clientInfo of room.clients.values()) {
              clientInfo.ws.close();
            }
          }
          rooms.clear();
          
          await new Promise<void>((resolveClose) => {
            wss.close(() => {
              httpServer.close(() => {
                console.log('Server closed');
                resolveClose();
              });
            });
          });
        },
        rooms
      });
    });
  });
}

// If run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  createServer().catch(console.error);
}
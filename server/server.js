import { WebSocketServer } from 'ws';
import { createServer as createHttpServer } from 'http';
import { URL } from 'url';

/**
 * Creates a WebSocket relay server for multiplayer rooms.
 * @param {Object} options - Server options
 * @param {number} options.port - Port to listen on (default: 3000, same as game)
 * @param {import('http').Server} [options.httpServer] - Reuse existing HTTP server (Vite same-port)
 * @returns {Object} Server instance with close() method
 */
export function createServer(options = {}) {
  const port = options.port || 3000;
  
  // Room management: Map<roomCode, { host, clients: Map<id, ws>, tick }>
  const rooms = new Map();
  
  // Generate unique client ID
  function generateId() {
    return Math.random().toString(36).substring(2, 10);
  }
  
  // Broadcast message to all clients in a room except sender
  function broadcastToRoom(roomCode, message, excludeId = null) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const data = JSON.stringify(message);
    for (const [id, ws] of room.clients) {
      if (id !== excludeId && ws.readyState === 1) { // WebSocket.OPEN = 1
        ws.send(data);
      }
    }
  }
  
  // Broadcast message to all clients in a room including sender
  function broadcastToAllInRoom(roomCode, message) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const data = JSON.stringify(message);
    for (const [id, ws] of room.clients) {
      if (ws.readyState === 1) {
        ws.send(data);
      }
    }
  }
  
  // Handle client joining a room
  function handleJoin(ws, roomCode, clientId, name) {
    console.log('[Server] handleJoin called:', { roomCode, clientId, name });
    let room = rooms.get(roomCode);
    
    if (!room) {
      // First joiner becomes host
      console.log('[Server] Creating new room:', roomCode, 'with host:', clientId);
      room = {
        host: clientId,
        clients: new Map(),
        tick: 0
      };
      rooms.set(roomCode, room);
    }
    
    // Notify new client about existing players in the room
    console.log('[Server] Notifying new client about existing players:', room.clients.size);
    for (const [existingId, existingWs] of room.clients) {
      // We need to get the name of existing clients - store it with the ws
      const existingName = existingWs._playerName || `Player${existingId.slice(0, 4)}`;
      console.log('[Server] Sending joined notification for existing player:', { existingId, existingName });
      ws.send(JSON.stringify({
        type: 'joined',
        id: existingId,
        name: existingName,
        self: false
      }));
    }
    
    room.clients.set(clientId, ws);
    // Store name on websocket for future reference
    ws._playerName = name;
    
    // Send joined confirmation to the joining client
    console.log('[Server] Sending joined confirmation to client:', clientId);
    ws.send(JSON.stringify({
      type: 'joined',
      id: clientId,
      name: name,
      self: true
    }));
    
    // Notify others in room about new player
    console.log('[Server] Notifying other players about new player:', clientId);
    broadcastToRoom(roomCode, {
      type: 'joined',
      id: clientId,
      name: name
    }, clientId);
    
    // If this is the host, notify them
    if (room.host === clientId) {
      console.log('[Server] Notifying client they are host:', clientId);
      ws.send(JSON.stringify({
        type: 'host-migrated',
        newHost: clientId
      }));
    }
    
    console.log('[Server] Room state after join:', {
      roomCode,
      host: room.host,
      totalClients: room.clients.size,
      newClient: clientId
    });
  }
  
  // Handle client leaving a room
  function handleLeave(roomCode, clientId) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    room.clients.delete(clientId);
    
    // Broadcast left message to remaining clients
    broadcastToAllInRoom(roomCode, {
      type: 'left',
      id: clientId
    });
    
    // Handle host migration if host left
    if (room.host === clientId) {
      if (room.clients.size > 0) {
        // Promote first remaining client as new host
        const newHostId = room.clients.keys().next().value;
        room.host = newHostId;
        
        broadcastToAllInRoom(roomCode, {
          type: 'host-migrated',
          newHost: newHostId
        });
      } else {
        // Room is empty, clean up
        rooms.delete(roomCode);
      }
    }
  }
  
  // Handle input message - relay to all other clients in room
  function handleInput(roomCode, clientId, message) {
    broadcastToRoom(roomCode, {
      type: 'input',
      id: clientId,
      seq: message.seq,
      yaw: message.yaw,
      pitch: message.pitch,
      keys: message.keys,
      fire: message.fire
    }, clientId);
  }
  
  // Handle state message - relay to all other clients in room
  function handleState(roomCode, clientId, message) {
    broadcastToRoom(roomCode, {
      type: 'state',
      id: clientId,
      tick: message.tick,
      entities: message.entities
    }, clientId);
  }
  
  // Attach relay to an HTTP server (same-port hosting).
  // Use noServer + manual upgrade so Vite's HMR socket isn't stolen.
  const httpServer = options.httpServer || createHttpServer();

  const wss = new WebSocketServer({ noServer: true });
  wss.on('error', (err) => console.error('[relay] wss error:', err.message));

  httpServer.on('upgrade', (req, socket, head) => {
    try {
      const u = new URL(req.url, `http://${req.headers.host || `localhost:${port}`}`);
      // Relay owns only ?room= upgrades; everything else (Vite HMR) passes through.
      if (!u.searchParams.has('room')) return;
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } catch (e) {
      try { socket.destroy(); } catch {}
    }
  });
  
  wss.on('connection', (ws, req) => {
    // Parse room code from query parameter
    const url = new URL(req.url, `http://localhost:${port}`);
    const roomCode = url.searchParams.get('room');
    
    if (!roomCode) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Missing room parameter. Connect with ?room=CODE'
      }));
      ws.close();
      return;
    }
    
    // Generate unique client ID as fallback
    let clientId = generateId();
    let hasJoined = false;
    
    // Handle incoming messages (ignore binary frames — e.g. stray HMR)
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      try {
        const message = JSON.parse(data.toString());
        console.log('[Server] Received message:', message);
        
        switch (message.type) {
          case 'join': {
            const name = message.name || `Player${clientId.slice(0, 4)}`;
            // Use client-provided ID if available
            const joinId = message.id || clientId;
            clientId = joinId; // Update clientId for future messages
            hasJoined = true;
            console.log('[Server] Handling join:', { roomCode, clientId, name });
            handleJoin(ws, roomCode, clientId, name);
            break;
          }
          
          case 'input': {
            handleInput(roomCode, clientId, message);
            break;
          }
          
          case 'state': {
            handleState(roomCode, clientId, message);
            break;
          }

           case 'ping': {
             ws.send(JSON.stringify({ type: 'pong' }));
             break;
           }
           case 'pong': {
             break;
           }
          
          default: {
            ws.send(JSON.stringify({
              type: 'error',
              message: `Unknown message type: ${message.type}`
            }));
          }
        }
      } catch (err) {
        console.error('[Server] Error parsing message:', err);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid JSON message'
        }));
      }
    });
    
    // Handle client disconnect
    ws.on('close', () => {
      if (hasJoined) {
        handleLeave(roomCode, clientId);
      }
    });
    
    // Handle errors
    ws.on('error', (err) => {
      console.error(`WebSocket error for client ${clientId}:`, err);
      if (hasJoined) {
        handleLeave(roomCode, clientId);
      }
    });
  });
  
  // If caller gave us their httpServer (Vite same-port), don't listen here.
  if (options.httpServer) {
    console.log(`Relay attached to existing HTTP server (same port)`);
    return {
      wss,
      httpServer,
      rooms,
      port,
    };
  }

  // Start server
  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      console.log(`WebSocket relay server running on port ${port}`);
      resolve({
        close: () => {
          return new Promise((resolveClose) => {
            // Close all WebSocket connections
            for (const room of rooms.values()) {
              for (const ws of room.clients.values()) {
                ws.close();
              }
            }
            wss.close(() => {
              httpServer.close(() => {
                console.log('Server closed');
                resolveClose();
              });
            });
          });
        },
        wss,
        httpServer,
        rooms
      });
    });
  });
}

// If run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  createServer().catch(console.error);
}
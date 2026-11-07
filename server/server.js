import { WebSocketServer } from 'ws';
import { createServer as createHttpServer } from 'http';
import { URL } from 'url';

/**
 * Creates a WebSocket relay server for multiplayer rooms.
 * @param {Object} options - Server options
 * @param {number} options.port - Port to listen on (default: 3001)
 * @returns {Object} Server instance with close() method
 */
export function createServer(options = {}) {
  const port = options.port || 3001;
  
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
    let room = rooms.get(roomCode);
    
    if (!room) {
      // First joiner becomes host
      room = {
        host: clientId,
        clients: new Map(),
        tick: 0
      };
      rooms.set(roomCode, room);
    }
    
    // Notify new client about existing players in the room
    for (const [existingId, existingWs] of room.clients) {
      // We need to get the name of existing clients - store it with the ws
      const existingName = existingWs._playerName || `Player${existingId.slice(0, 4)}`;
      ws.send(JSON.stringify({
        type: 'joined',
        id: existingId,
        name: existingName
      }));
    }
    
    room.clients.set(clientId, ws);
    // Store name on websocket for future reference
    ws._playerName = name;
    
    // Send joined confirmation to the joining client
    ws.send(JSON.stringify({
      type: 'joined',
      id: clientId,
      name: name
    }));
    
    // Notify others in room about new player
    broadcastToRoom(roomCode, {
      type: 'joined',
      id: clientId,
      name: name
    }, clientId);
    
    // If this is the host, notify them
    if (room.host === clientId) {
      ws.send(JSON.stringify({
        type: 'host-migrated',
        newHost: clientId
      }));
    }
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
  
  // Create HTTP server for WebSocket upgrade
  const httpServer = createHttpServer();
  
  const wss = new WebSocketServer({ server: httpServer });
  
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
    
    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'join': {
            const name = message.name || `Player${clientId.slice(0, 4)}`;
            // Use client-provided ID if available
            const joinId = message.id || clientId;
            clientId = joinId; // Update clientId for future messages
            hasJoined = true;
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
          
          default: {
            ws.send(JSON.stringify({
              type: 'error',
              message: `Unknown message type: ${message.type}`
            }));
          }
        }
      } catch (err) {
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
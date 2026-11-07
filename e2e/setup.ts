import { WebSocket } from 'ws';
import { createServer } from '../server/server';

export interface TestMultiplayerEngine {
  startMultiplayer: (room: string, isHost: boolean, name: string) => Promise<void>;
  disconnect: () => Promise<void>;
  room: string;
  isHost: boolean;
  players: Map<string, any>;
  update: (delta: number) => void;
}

export function createTestMultiplayerEngine(): TestMultiplayerEngine {
  let ws: WebSocket | null = null;
  let room = '';
  let isHost = false;
  let players = new Map<string, any>();
  let connected = false;
  let messageQueue: any[] = [];

  return {
    async startMultiplayer(roomCode: string, host: boolean, name: string) {
      room = roomCode;
      isHost = host;
      
      return new Promise((resolve, reject) => {
        const url = `ws://localhost:3001?room=${roomCode}`;
        ws = new WebSocket(url);
        
        ws.on('open', () => {
          connected = true;
          // Send join message
          ws!.send(JSON.stringify({
            type: 'join',
            id: `test-${Date.now()}`,
            name: name
          }));
          resolve();
        });
        
        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            messageQueue.push(message);
            
            // Handle different message types
            switch (message.type) {
              case 'joined':
                players.set(message.id, {
                  id: message.id,
                  name: message.name,
                  isHost: message.id === roomCode || host
                });
                break;
              case 'left':
                players.delete(message.id);
                break;
              case 'host-migrated':
                // Update host status if needed
                break;
            }
          } catch (err) {
            console.error('Error parsing message:', err);
          }
        });
        
        ws.on('error', (err) => {
          reject(err);
        });
        
        // Timeout after 5 seconds
        setTimeout(() => {
          if (!connected) {
            reject(new Error('Connection timeout'));
          }
        }, 5000);
      });
    },
    
    async disconnect() {
      if (ws) {
        ws.close();
        ws = null;
      }
      connected = false;
      players.clear();
      messageQueue = [];
    },
    
    get room() { return room; },
    get isHost() { return isHost; },
    get players() { return players; },
    
    update(delta: number) {
      // Simulate game loop processing
      if (ws && connected) {
        // Send test input message
        ws.send(JSON.stringify({
          type: 'input',
          id: `test-${Date.now()}`,
          seq: Date.now(),
          yaw: 0,
          pitch: 0,
          keys: {},
          fire: false
        }));
      }
    }
  };
}

export async function startServer(url: string) {
  const server = await createServer({ port: 3001 });
  return {
    stop: () => server.close(),
    server
  };
}
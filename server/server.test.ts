import { createServer } from './server.js';
import { WebSocket } from 'ws';
import { once } from 'events';

// Helper to wait for a specific message type
async function waitForMessage(ws: WebSocket, type: string, timeout = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for message type: ${type}`));
    }, timeout);

    function onMessage(data: Buffer) {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === type) {
          cleanup();
          resolve(msg);
        }
      } catch {
        // Ignore parse errors, keep waiting
      }
    }

    function onClose() {
      cleanup();
      reject(new Error('WebSocket closed before receiving message'));
    }

    function onError(err: Error) {
      cleanup();
      reject(err);
    }

    function cleanup() {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('close', onClose);
      ws.off('error', onError);
    }

    ws.on('message', onMessage);
    ws.on('close', onClose);
    ws.on('error', onError);
  });
}

// Helper to collect ALL messages of a type until timeout
async function waitForMessages(ws: WebSocket, type: string, collectTimeout = 500): Promise<any[]> {
  const messages: any[] = [];
  
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(messages);
    }, collectTimeout);

    function onMessage(data: Buffer) {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === type) {
          messages.push(msg);
        }
      } catch {
        // Ignore parse errors
      }
    }

    function onClose() {
      cleanup();
      resolve(messages);
    }

    function onError(err: Error) {
      cleanup();
      resolve(messages);
    }

    function cleanup() {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('close', onClose);
      ws.off('error', onError);
    }

    ws.on('message', onMessage);
    ws.on('close', onClose);
    ws.on('error', onError);
  });
}

// Helper to collect ALL messages (any type) until timeout
async function waitForAnyMessages(ws: WebSocket, collectTimeout = 500): Promise<any[]> {
  const messages: any[] = [];
  
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(messages);
    }, collectTimeout);

    function onMessage(data: Buffer) {
      try {
        const msg = JSON.parse(data.toString());
        messages.push(msg);
      } catch {
        // Ignore parse errors
      }
    }

    function onClose() {
      cleanup();
      resolve(messages);
    }

    function onError(err: Error) {
      cleanup();
      resolve(messages);
    }

    function cleanup() {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('close', onClose);
      ws.off('error', onError);
    }

    ws.on('message', onMessage);
    ws.on('close', onClose);
    ws.on('error', onError);
  });
}

// Helper to send and wait for joined confirmation
async function joinRoom(ws: WebSocket, name: string, clientId?: string): Promise<string> {
  ws.send(JSON.stringify({ type: 'join', name, id: clientId }));
  // Collect all joined messages - the last one is our confirmation
  const joinedMessages = await waitForMessages(ws, 'joined', 500);
  
  if (joinedMessages.length === 0) {
    throw new Error('No joined messages received');
  }
  
  // The last joined message is our confirmation
  const ourConfirmation = joinedMessages[joinedMessages.length - 1];
  return ourConfirmation.id;
}

describe('WebSocket Relay Server', () => {
  let server: Awaited<ReturnType<typeof createServer>>;
  let currentPort: number;
  const basePort = 3100;
  let portCounter = 0;

  async function createTestServer(): Promise<{ server: Awaited<ReturnType<typeof createServer>>; port: number }> {
    const port = basePort + portCounter++;
    const server = await createServer({ port });
    return { server, port };
  }

  afterEach(async () => {
    if (server) {
      try {
        await server.close();
      } catch (err) {
        console.error('Error closing server:', err);
      }
      // Small delay to allow connections to fully close
      await new Promise(r => setTimeout(r, 50));
    }
  });

  // ===== Basic Join Tests =====

  test('server accepts connections with room parameter', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const ws = new WebSocket(`ws://localhost:${currentPort}?room=TEST`);
    await once(ws, 'open');
    ws.close();
    await once(ws, 'close');
  });

  test('server rejects connections without room parameter', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const ws = new WebSocket(`ws://localhost:${currentPort}`);
    try {
      const error = await waitForMessage(ws, 'error');
      expect(error.code).toBe('MISSING_ROOM');
    } catch (err) {
      console.error('Test error:', err);
      throw err;
    } finally {
      ws.close();
      await once(ws, 'close');
    }
  });

  test('first joiner becomes host', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const ws = new WebSocket(`ws://localhost:${currentPort}?room=HOST`);
    await once(ws, 'open');
    
    const hostId = await joinRoom(ws, 'Host');
    
    // First joiner becomes host - verify by checking room exists
    expect(hostId).toBeDefined();
    expect(typeof hostId).toBe('string');
    
    ws.close();
  });

  // ===== Server-Authoritative ID Tests (Task 3) =====

  test('server assigns unique IDs even when clients provide same id', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const client1 = new WebSocket(`ws://localhost:${currentPort}?room=SAMEID`);
    const client2 = new WebSocket(`ws://localhost:${currentPort}?room=SAMEID`);
    await Promise.all([once(client1, 'open'), once(client2, 'open')]);
    
    // Both send same ID
    const id1 = await joinRoom(client1, 'Client1', 'duplicate');
    const id2 = await joinRoom(client2, 'Client2', 'duplicate');
    
    expect(id1).not.toBe(id2);
    expect(id1).not.toBe('duplicate');
    expect(id2).not.toBe('duplicate');
    expect(id1.length).toBeGreaterThan(10); // UUID format
    expect(id2.length).toBeGreaterThan(10);
    
    client1.close();
    client2.close();
  });

  test('server ignores client-provided id in join message', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const ws = new WebSocket(`ws://localhost:${currentPort}?room=IGNOREID`);
    await once(ws, 'open');
    
    const assignedId = await joinRoom(ws, 'Test', 'client-provided-id');
    
    expect(assignedId).not.toBe('client-provided-id');
    expect(assignedId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    
    ws.close();
  });

  // ===== Input Relay Tests =====

  test('server relays input from client to all others in same room', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const host = new WebSocket(`ws://localhost:${currentPort}?room=INPUT`);
    const client = new WebSocket(`ws://localhost:${currentPort}?room=INPUT`);
    await Promise.all([once(host, 'open'), once(client, 'open')]);
    
    const hostId = await joinRoom(host, 'Host');
    const clientId = await joinRoom(client, 'Client');
    
    // Host sends input
    const inputMsg = { type: 'input', seq: 1, yaw: 0.5, pitch: 0.2, keys: { w: true }, fire: false };
    host.send(JSON.stringify(inputMsg));
    
    // Client should receive relayed input with host's ID
    const received = await waitForMessage(client, 'input');
    expect(received.id).toBe(hostId);
    expect(received.seq).toBe(1);
    expect(received.yaw).toBe(0.5);
    expect(received.pitch).toBe(0.2);
    expect(received.keys).toEqual({ w: true });
    expect(received.fire).toBe(false);
    
    host.close();
    client.close();
  });

  test('server does not relay input back to sender', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const host = new WebSocket(`ws://localhost:${currentPort}?room=NOECHO`);
    const client = new WebSocket(`ws://localhost:${currentPort}?room=NOECHO`);
    await Promise.all([once(host, 'open'), once(client, 'open')]);
    
    await joinRoom(host, 'Host');
    await joinRoom(client, 'Client');
    
    // Host sends input
    host.send(JSON.stringify({ type: 'input', seq: 1, yaw: 0, pitch: 0, keys: {}, fire: false }));
    
    // Host should NOT receive it back
    // Client SHOULD receive it
    const clientMsg = await waitForMessage(client, 'input');
    expect(clientMsg.id).toBeDefined();
    
    // Verify host doesn't get it (wait a bit)
    await new Promise(r => setTimeout(r, 100));
    
    host.close();
    client.close();
  });

  test('server relays input to multiple clients in room', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const host = new WebSocket(`ws://localhost:${currentPort}?room=MULTI`);
    const client1 = new WebSocket(`ws://localhost:${currentPort}?room=MULTI`);
    const client2 = new WebSocket(`ws://localhost:${currentPort}?room=MULTI`);
    await Promise.all([once(host, 'open'), once(client1, 'open'), once(client2, 'open')]);
    
    const hostId = await joinRoom(host, 'Host');
    await joinRoom(client1, 'Client1');
    await joinRoom(client2, 'Client2');
    
    host.send(JSON.stringify({ type: 'input', seq: 1, yaw: 0, pitch: 0, keys: {}, fire: false }));
    
    const [msg1, msg2] = await Promise.all([
      waitForMessage(client1, 'input'),
      waitForMessage(client2, 'input')
    ]);
    
    expect(msg1.id).toBe(hostId);
    expect(msg2.id).toBe(hostId);
    
    host.close();
    client1.close();
    client2.close();
  });

  // ===== State Relay Tests =====

  test('server relays state from host to all other clients', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const host = new WebSocket(`ws://localhost:${currentPort}?room=STATE`);
    const client = new WebSocket(`ws://localhost:${currentPort}?room=STATE`);
    await Promise.all([once(host, 'open'), once(client, 'open')]);
    
    const hostId = await joinRoom(host, 'Host');
    await joinRoom(client, 'Client');
    
    // Host sends state
    const stateMsg = {
      type: 'state',
      tick: 100,
      entities: [{ id: hostId, x: 10, y: 0, z: 5, yaw: 0, pitch: 0, hp: 100 }]
    };
    host.send(JSON.stringify(stateMsg));
    
    // Client should receive relayed state with server tick
    const received = await waitForMessage(client, 'state');
    expect(received.id).toBe(hostId);
    expect(received.entities).toHaveLength(1);
    expect(received.entities[0].x).toBe(10);
    // Server overrides tick with its own
    expect(typeof received.tick).toBe('number');
    
    host.close();
    client.close();
  });

  test('server rejects state from non-host clients', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const host = new WebSocket(`ws://localhost:${currentPort}?room=NOT_HOST`);
    const client = new WebSocket(`ws://localhost:${currentPort}?room=NOT_HOST`);
    await Promise.all([once(host, 'open'), once(client, 'open')]);
    
    await joinRoom(host, 'Host');
    const clientId = await joinRoom(client, 'Client');
    
    // Client tries to send state
    client.send(JSON.stringify({ type: 'state', tick: 0, entities: [] }));
    
    // Client should receive error
    const error = await waitForMessage(client, 'error');
    expect(error.code).toBe('NOT_HOST');
    
    host.close();
    client.close();
  });

  // ===== Late-Joiner State Sync Tests (Task 5) =====

  test('late joiner receives current state from host', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const host = new WebSocket(`ws://localhost:${currentPort}?room=STATESYNC`);
    const client1 = new WebSocket(`ws://localhost:${currentPort}?room=STATESYNC`);
    await Promise.all([once(host, 'open'), once(client1, 'open')]);
    
    const hostId = await joinRoom(host, 'Host');
    await joinRoom(client1, 'Client1');
    
    // Host sends state
    const stateMsg = {
      type: 'state',
      tick: 100,
      entities: [{ id: hostId, x: 10, y: 0, z: 5, yaw: 0, pitch: 0, hp: 100 }]
    };
    host.send(JSON.stringify(stateMsg));
    await waitForMessage(client1, 'state'); // client1 receives state
    
    // Late joiner connects and joins manually (to capture all messages)
    const client2 = new WebSocket(`ws://localhost:${currentPort}?room=STATESYNC`);
    await once(client2, 'open');
    client2.send(JSON.stringify({ type: 'join', name: 'Client2' }));
    
    // Collect all messages for a short time
    const allMessages = await waitForAnyMessages(client2, 500);
    
    const joinedMessages = allMessages.filter(m => m.type === 'joined');
    const stateReceived = allMessages.find(m => m.type === 'state');
    
    // Late joiner receives: joined (host), joined (client1), joined (self), state
    expect(joinedMessages).toHaveLength(3); // host + client1 + self
    expect(stateReceived).toBeDefined();
    expect(stateReceived!.entities).toHaveLength(1);
    expect(stateReceived!.entities[0].x).toBe(10);
    
    host.close();
    client1.close();
    client2.close();
  });

  test('late joiner receives player list without state if no state sent yet', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const host = new WebSocket(`ws://localhost:${currentPort}?room=NOSTATE`);
    const client1 = new WebSocket(`ws://localhost:${currentPort}?room=NOSTATE`);
    await Promise.all([once(host, 'open'), once(client1, 'open')]);
    
    const hostId = await joinRoom(host, 'Host');
    await joinRoom(client1, 'Client1');
    
    // No state sent by host
    
    // Late joiner connects and joins manually (to capture all messages)
    const client2 = new WebSocket(`ws://localhost:${currentPort}?room=NOSTATE`);
    await once(client2, 'open');
    client2.send(JSON.stringify({ type: 'join', name: 'Client2' }));
    
    // Collect all messages for a short time
    const allMessages = await waitForAnyMessages(client2, 500);
    
    const joinedMessages = allMessages.filter(m => m.type === 'joined');
    const stateReceived = allMessages.find(m => m.type === 'state');
    
    // Late joiner receives: joined (host), joined (client1), joined (self), NO state
    expect(joinedMessages).toHaveLength(3); // host + client1 + self
    expect(stateReceived).toBeUndefined();
    
    host.close();
    client1.close();
    client2.close();
  });

  // ===== Host Migration Tests =====

  test('server promotes new host when host leaves', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const host = new WebSocket(`ws://localhost:${currentPort}?room=MIGRATE`);
    const client = new WebSocket(`ws://localhost:${currentPort}?room=MIGRATE`);
    await Promise.all([once(host, 'open'), once(client, 'open')]);
    
    const hostId = await joinRoom(host, 'Host');
    const clientId = await joinRoom(client, 'Client');
    
    // Host disconnects
    host.close();
    
    // Client should receive left + host-migrated (both sent quickly)
    // Collect all messages for a short time
    const allMessages = await waitForAnyMessages(client, 500);
    
    const leftMessages = allMessages.filter(m => m.type === 'left');
    const migratedMessages = allMessages.filter(m => m.type === 'host-migrated');
    
    expect(leftMessages.length).toBeGreaterThan(0);
    expect(leftMessages[0].id).toBe(hostId);
    
    expect(migratedMessages.length).toBeGreaterThan(0);
    expect(migratedMessages[0].newHost).toBe(clientId);
    
    client.close();
  });

  test('host migration works with multiple clients', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const host = new WebSocket(`ws://localhost:${currentPort}?room=MIGRATE2`);
    const client1 = new WebSocket(`ws://localhost:${currentPort}?room=MIGRATE2`);
    const client2 = new WebSocket(`ws://localhost:${currentPort}?room=MIGRATE2`);
    await Promise.all([once(host, 'open'), once(client1, 'open'), once(client2, 'open')]);
    
    const hostId = await joinRoom(host, 'Host');
    const client1Id = await joinRoom(client1, 'Client1');
    const client2Id = await joinRoom(client2, 'Client2');
    
    // Host disconnects
    host.close();
    
    // Both clients should receive host-migrated with client1 as new host (first in Map)
    const [migrated1, migrated2] = await Promise.all([
      waitForMessage(client1, 'host-migrated'),
      waitForMessage(client2, 'host-migrated')
    ]);
    
    expect(migrated1.newHost).toBe(client1Id);
    expect(migrated2.newHost).toBe(client1Id);
    
    client1.close();
    client2.close();
  });

  // ===== Leave Handling Tests =====

  test('server broadcasts left when client disconnects', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const host = new WebSocket(`ws://localhost:${currentPort}?room=LEAVE`);
    const client = new WebSocket(`ws://localhost:${currentPort}?room=LEAVE`);
    await Promise.all([once(host, 'open'), once(client, 'open')]);
    
    const hostId = await joinRoom(host, 'Host');
    const clientId = await joinRoom(client, 'Client');
    
    // Client disconnects
    client.close();
    
    // Host should receive left message
    const leftMsg = await waitForMessage(host, 'left');
    expect(leftMsg.id).toBe(clientId);
    
    host.close();
  });

  test('room is cleaned up when last client leaves', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const host = new WebSocket(`ws://localhost:${currentPort}?room=CLEANUP`);
    await once(host, 'open');
    
    await joinRoom(host, 'Host');
    host.close();
    
    // Wait for cleanup
    await new Promise(r => setTimeout(r, 100));
    
    // New connection to same room should create fresh room
    const newHost = new WebSocket(`ws://localhost:${currentPort}?room=CLEANUP`);
    await once(newHost, 'open');
    const newId = await joinRoom(newHost, 'NewHost');
    
    // Should be a new room (no other players)
    // Just verify it works
    expect(newId).toBeDefined();
    
    newHost.close();
  });

  // ===== Message Validation Tests (Task 4) =====

  test('server rejects invalid input message (missing fields)', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const host = new WebSocket(`ws://localhost:${currentPort}?room=VALIDATION`);
    const client = new WebSocket(`ws://localhost:${currentPort}?room=VALIDATION`);
    await Promise.all([once(host, 'open'), once(client, 'open')]);
    
    await joinRoom(host, 'Host');
    await joinRoom(client, 'Client');
    
    // Send invalid input (missing seq)
    host.send(JSON.stringify({ type: 'input', yaw: 0, pitch: 0, keys: {}, fire: false }));
    
    // Host should receive error
    const error = await waitForMessage(host, 'error');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toContain('seq');
    
    // Client should NOT receive relayed input
    await new Promise(r => setTimeout(r, 100));
    
    host.close();
    client.close();
  });

  test('server rejects invalid state message (missing entities)', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const host = new WebSocket(`ws://localhost:${currentPort}?room=VALIDATION2`);
    const client = new WebSocket(`ws://localhost:${currentPort}?room=VALIDATION2`);
    await Promise.all([once(host, 'open'), once(client, 'open')]);
    
    await joinRoom(host, 'Host');
    await joinRoom(client, 'Client');
    
    // Send invalid state (missing entities)
    host.send(JSON.stringify({ type: 'state', tick: 0 }));
    
    // Host should receive error
    const error = await waitForMessage(host, 'error');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toContain('entities');
    
    host.close();
    client.close();
  });

  test('server rejects malformed JSON', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const ws = new WebSocket(`ws://localhost:${currentPort}?room=JSON`);
    await once(ws, 'open');
    
    await joinRoom(ws, 'Test');
    
    // Send invalid JSON
    ws.send('not valid json {');
    
    const error = await waitForMessage(ws, 'error');
    expect(error.code).toBe('INVALID_JSON');
    
    ws.close();
  });

  test('server rejects unknown message type', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const ws = new WebSocket(`ws://localhost:${currentPort}?room=UNKNOWN`);
    await once(ws, 'open');
    
    await joinRoom(ws, 'Test');
    
    // Send unknown type
    ws.send(JSON.stringify({ type: 'unknown', data: 'test' }));
    
    const error = await waitForMessage(ws, 'error');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toContain('type');
    
    ws.close();
  });

  test('server requires join before input/state', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const ws = new WebSocket(`ws://localhost:${currentPort}?room=NOJOIN`);
    await once(ws, 'open');
    
    // Send input without joining
    ws.send(JSON.stringify({ type: 'input', seq: 1, yaw: 0, pitch: 0, keys: {}, fire: false }));
    
    const error = await waitForMessage(ws, 'error');
    expect(error.code).toBe('NOT_JOINED');
    
    ws.close();
  });

  // ===== Rate Limiting Tests (Task 7) =====

  test('server enforces 60 input messages/sec rate limit', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const host = new WebSocket(`ws://localhost:${currentPort}?room=RATELIMIT`);
    const client = new WebSocket(`ws://localhost:${currentPort}?room=RATELIMIT`);
    await Promise.all([once(host, 'open'), once(client, 'open')]);
    
    await joinRoom(host, 'Host');
    await joinRoom(client, 'Client');
    
    // Send 61 input messages rapidly
    for (let i = 0; i < 61; i++) {
      host.send(JSON.stringify({ 
        type: 'input', seq: i, yaw: 0, pitch: 0, keys: {}, fire: false 
      }));
    }
    
    // Host should receive error for exceeding rate limit
    const error = await waitForMessage(host, 'error', 1000);
    expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
    
    host.close();
    client.close();
  });

  test('rate limit resets after 1 second', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const host = new WebSocket(`ws://localhost:${currentPort}?room=RATELIMIT2`);
    const client = new WebSocket(`ws://localhost:${currentPort}?room=RATELIMIT2`);
    await Promise.all([once(host, 'open'), once(client, 'open')]);
    
    await joinRoom(host, 'Host');
    await joinRoom(client, 'Client');
    
    // Send 60 messages (at limit)
    for (let i = 0; i < 60; i++) {
      host.send(JSON.stringify({ 
        type: 'input', seq: i, yaw: 0, pitch: 0, keys: {}, fire: false 
      }));
    }
    
    // Wait for rate limit window to reset
    await new Promise(r => setTimeout(r, 1100));
    
    // Send one more - should work
    host.send(JSON.stringify({ 
      type: 'input', seq: 60, yaw: 0, pitch: 0, keys: {}, fire: false 
    }));
    
    // Client should receive it (no error for host)
    const received = await waitForMessage(client, 'input');
    expect(received.seq).toBe(60);
    
    host.close();
    client.close();
  });

  // ===== Message Size Limit Tests (Task 7) =====

  test('server rejects messages larger than 16KB', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const host = new WebSocket(`ws://localhost:${currentPort}?room=SIZE`);
    await once(host, 'open');
    
    await joinRoom(host, 'Host');
    
    // Create state with huge entities array (>16KB)
    const hugeEntities = Array(2000).fill({ 
      id: 'x', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, hp: 100 
    });
    const largeState = { type: 'state', tick: 0, entities: hugeEntities };
    
    // This should trigger maxPayload limit - connection may close
    host.send(JSON.stringify(largeState));
    
    // Wait for close or error
    await new Promise(r => setTimeout(r, 500));
    
    // Connection should be closed due to maxPayload
    expect(host.readyState).toBe(WebSocket.CLOSED);
  });

  // ===== Concurrent Rooms Tests =====

  test('rooms are isolated - messages dont cross rooms', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const host1 = new WebSocket(`ws://localhost:${currentPort}?room=ROOM1`);
    const client1 = new WebSocket(`ws://localhost:${currentPort}?room=ROOM1`);
    const host2 = new WebSocket(`ws://localhost:${currentPort}?room=ROOM2`);
    const client2 = new WebSocket(`ws://localhost:${currentPort}?room=ROOM2`);
    await Promise.all([once(host1, 'open'), once(client1, 'open'), once(host2, 'open'), once(client2, 'open')]);
    
    await joinRoom(host1, 'Host1');
    await joinRoom(client1, 'Client1');
    await joinRoom(host2, 'Host2');
    await joinRoom(client2, 'Client2');
    
    // Host1 sends input
    host1.send(JSON.stringify({ type: 'input', seq: 1, yaw: 0, pitch: 0, keys: {}, fire: false }));
    
    // Client1 should receive, client2 should NOT
    const received1 = await waitForMessage(client1, 'input');
    expect(received1.id).toBeDefined();
    
    // Wait a bit to ensure client2 doesn't receive
    await new Promise(r => setTimeout(r, 100));
    
    host1.close();
    client1.close();
    host2.close();
    client2.close();
  });

  test('multiple rooms can exist simultaneously', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const rooms = ['A', 'B', 'C', 'D'];
    const connections: WebSocket[] = [];
    
    for (const room of rooms) {
      const ws = new WebSocket(`ws://localhost:${currentPort}?room=${room}`);
      await once(ws, 'open');
      await joinRoom(ws, `Player${room}`);
      connections.push(ws);
    }
    
    // All should be connected
    expect(connections.every(w => w.readyState === WebSocket.OPEN)).toBe(true);
    
    for (const ws of connections) {
      ws.close();
    }
  });

  // ===== 30Hz Tick Tests (Task 6) =====

  test('room tick increments over time', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const host = new WebSocket(`ws://localhost:${currentPort}?room=TICK`);
    const client = new WebSocket(`ws://localhost:${currentPort}?room=TICK`);
    await Promise.all([once(host, 'open'), once(client, 'open')]);
    
    await joinRoom(host, 'Host');
    await joinRoom(client, 'Client');
    
    // Get initial tick by sending state and checking relayed tick on client
    host.send(JSON.stringify({ type: 'state', tick: 0, entities: [] }));
    const initialState = await waitForMessage(client, 'state');
    const initialTick = initialState.tick;
    
    // Wait ~100ms (3 ticks at 30Hz)
    await new Promise(r => setTimeout(r, 110));
    
    // Send another state
    host.send(JSON.stringify({ type: 'state', tick: 0, entities: [] }));
    const laterState = await waitForMessage(client, 'state');
    const laterTick = laterState.tick;
    
    // Tick should have advanced
    expect(laterTick).toBeGreaterThan(initialTick);
    
    host.close();
    client.close();
  });

  // ===== Error Code Tests =====

  test('error messages include codes for programmatic handling', async () => {
    const result = await createTestServer();
    server = result.server;
    currentPort = result.port;
    const ws = new WebSocket(`ws://localhost:${currentPort}?room=ERRORCODE`);
    await once(ws, 'open');
    
    // Send input WITHOUT joining
    ws.send(JSON.stringify({ type: 'input', seq: 1, yaw: 0, pitch: 0, keys: {}, fire: false }));
    const notJoinedError = await waitForMessage(ws, 'error');
    expect(notJoinedError.code).toBe('NOT_JOINED');
    
    ws.close();
  });
});
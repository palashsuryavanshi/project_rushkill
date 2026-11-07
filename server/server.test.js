import { createServer } from './server.js';
import { WebSocket } from 'ws';
import { once } from 'events';

test('server routes input from client to all others in same room', async () => {
  const server = await createServer({ port: 3001 });
  const host = new WebSocket('ws://localhost:3001?room=TEST');
  const client = new WebSocket('ws://localhost:3001?room=TEST');
  
  await Promise.all([once(host, 'open'), once(client, 'open')]);
  
  // Host joins first
  host.send(JSON.stringify({ type: 'join', id: 'host', name: 'Host' }));
  // Wait for host to receive its own joined confirmation
  await once(host, 'message');
  
  // Client joins second
  client.send(JSON.stringify({ type: 'join', id: 'client', name: 'Client' }));
  
  // Client should receive joined message about host
  const [received] = await once(client, 'message');
  const msg = JSON.parse(received.toString());
  expect(msg.type).toBe('joined');
  expect(msg.id).toBe('host');
  
  await server.close();
}, 10000);
import { createServer } from '../server/dist/server.js';

const server = await createServer({ port: 3001 });

console.log('🚀 Test WebSocket server running on ws://localhost:3001');
console.log('Press Ctrl+C to stop the server');

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down test server...');
  await server.close();
  process.exit(0);
});
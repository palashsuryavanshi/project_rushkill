import { createServer } from './server.js';
import { findAvailablePort } from './portUtils.js';

console.log('Starting WebSocket server test...');

const port = await findAvailablePort(3001);
console.log(`Using port ${port} for WebSocket server`);

const server = await createServer({ port });
console.log(`Server started successfully on port ${port}!`);
console.log(`ws://localhost:${port}`);
console.log('Press Ctrl+C to stop...');

process.on('SIGINT', async () => {
  console.log('\nShutting down server...');
  await server.close();
  process.exit(0);
});

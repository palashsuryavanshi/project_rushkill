// Port allocation utility for server (Node net probes)
import net from 'net';

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false)); // in use
    server.listen(port, () => {
      server.close(() => resolve(true)); // free
    });
  });
}

export async function findAvailablePort(startPort, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No available ports found between ${startPort} and ${startPort + maxAttempts - 1}`);
}

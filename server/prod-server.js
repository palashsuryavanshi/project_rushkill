// Production same-port server for Fly.io: serves dist/ + WebSocket relay on one port.
// Usage: npm run build && node server/prod-server.js
import { createServer as createHttpServer } from 'http';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from './server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

const httpServer = createHttpServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, `http://localhost`).pathname);
    let file = path.join(DIST, urlPath === '/' ? 'index.html' : urlPath);
    let data;
    try { data = await readFile(file); }
    catch {
      // SPA fallback
      file = path.join(DIST, 'index.html');
      data = await readFile(file);
    }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(500); res.end('Server error');
  }
});

createServer({ httpServer, port: PORT });
httpServer.listen(PORT, () => {
  console.log(`Game + relay on ws(s)://localhost:${PORT} (same-port, prod)`);
});

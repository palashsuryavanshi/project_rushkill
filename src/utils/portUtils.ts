// Port allocation utility (browser-safe: probes via WebSocket, no fetch/CORS)
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (inUse: boolean) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* noop */ }
      resolve(inUse);
    };
    let ws: WebSocket;
    try {
      // ws:// probe; also try wss fallback not needed locally
      ws = new WebSocket(`ws://localhost:${port}`);
    } catch {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => finish(false), 200);
    ws.onopen = () => { clearTimeout(timer); finish(true); };
    ws.onerror = () => { clearTimeout(timer); finish(false); };
    ws.onclose = () => { clearTimeout(timer); finish(false); };
  });
}

export async function findAvailablePort(startPort: number, maxAttempts = 30): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    const inUse = await isPortInUse(port);
    if (!inUse) return port;
  }
  throw new Error(`No available ports found between ${startPort} and ${startPort + maxAttempts - 1}`);
}

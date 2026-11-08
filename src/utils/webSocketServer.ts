// Same-port relay: game + WebSocket share one HTTP server (Vite dev / Fly prod).
// Browser just uses the page origin — no port probing or separate relay process.

export interface WebSocketServer {
  port: number;
  url: string;
  close?: () => Promise<void>;
}

let activeServer: WebSocketServer | null = null;

/**
 * Called ONLY after user selects Host or Join in the Multiplayer (main) menu.
 * With same-port hosting there's nothing to boot — the relay is already
 * attached to the game server. Returns the same-origin ws URL.
 */
export async function startWebSocketServer(): Promise<WebSocketServer> {
  if (typeof window === 'undefined') {
    return { port: 3000, url: 'ws://localhost:3000' };
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname || 'localhost';
  const port = window.location.port ? Number(window.location.port) : (proto === 'wss:' ? 443 : 80);
  const url = `${proto}//${host}${window.location.port ? `:${port}` : ''}`;
  activeServer = { port, url };
  return activeServer;
}

export async function stopWebSocketServer(): Promise<void> {
  activeServer = null;
}

export function getWebSocketServer(): WebSocketServer | null {
  return activeServer;
}

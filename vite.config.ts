import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
// @ts-ignore - JS module, no types
import {createServer as createRelay} from './server/server.js';

// Same-port relay: attach the WebSocket relay to Vite's HTTP server so
// `npm run dev` serves game + multiplayer on ONE port (no 3002/3003 guessing).
function samePortRelay(): any {
  return {
    name: 'same-port-relay',
    configureServer(server: any) {
      const httpServer = server.httpServer;
      if (!httpServer) return;
      // @ts-ignore - relay options include httpServer for same-port hosting
      const relay: any = createRelay({ httpServer, port: server.config.server.port || 3000 });
      server.config.logger.info(`Relay ready at ws://localhost:${server.config.server.port}`);
      server.httpServer?.on('close', () => {
        try { relay.wss.close(); } catch {}
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';
  
  return {
    plugins: [react(), tailwindcss(), samePortRelay()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    base: '/',
    build: {
      minify: 'oxc',
      target: 'es2020',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three')) return 'three';
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react';
            if (id.includes('node_modules/lucide-react')) return 'lucide-react';
          },
          minify: {
            compress: { 
              dropConsole: isProduction, 
              dropDebugger: isProduction,
              pure_funcs: isProduction ? ['console.log', 'console.debug'] : []
            },
            mangle: true,
            codegen: true,
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
    server: {
      // Default to loopback only; use `npm run dev:lan` for explicit LAN access.
      host: 'localhost',
      port: 3000,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Single-port: relay rides along; search for next free game+relay port if 3000 busy
      strictPort: false,
    },
    define: {
      global: 'globalThis',
      'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
    },
    optimizeDeps: {
      include: ['three', 'react', 'react-dom'],
      exclude: ['@types/jest'],
    },
  };
});

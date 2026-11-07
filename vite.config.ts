import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';
  
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    base: isProduction ? '/rushkill/' : '/',
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

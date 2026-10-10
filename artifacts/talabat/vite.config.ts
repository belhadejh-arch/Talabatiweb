import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const port = Number(process.env.PORT || process.env.DEV_PORT || 3000);
const basePath = process.env.BASE_PATH || '/';

export default defineConfig(async ({ mode }) => {
  const apiTarget =
    process.env.API_TARGET ||
    (mode === 'development'
      ? 'http://127.0.0.1:8080'
      : process.env.PUBLIC_API_URL || 'https://talabatiweb-wo8o.onrender.com');

  return {
    base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    // Vercel's project root is the repository root, not this workspace package.
    outDir: path.resolve(import.meta.dirname, '../../dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    // The managed preview routes through this Vite service. Forward all
    // prefixed API requests to the current local backend, not the separately
    // deployed production backend (which may run an older API version).
    proxy: {
      [`${basePath.replace(/\/$/, '')}/api/storage/db-images`]: {
        target: apiTarget,
        changeOrigin: true,
        secure: true,
        rewrite: (url) => url.replace(new RegExp(`^${basePath.replace(/\/$/, '')}/api`), '/api'),
      },
      [`${basePath.replace(/\/$/, '')}/api`]: {
        target: apiTarget,
        changeOrigin: true,
        secure: true,
        rewrite: (url) => url.replace(new RegExp(`^${basePath.replace(/\/$/, '')}/api`), '/api'),
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  };
});

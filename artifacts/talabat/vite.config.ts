import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

// Managed previews provide both variables; a Vercel static build provides neither.
const port = Number(process.env.PORT || 5173);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

const basePath = process.env.BASE_PATH || '/';

export default defineConfig({
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
    // The existing Node backend isn't an artifact service in this checkout.
    // Match the prefixed preview API and forward it to the same Render upstream
    // used by vercel.json, without exposing a cross-origin URL to the browser.
    proxy: {
      [`${basePath.replace(/\/$/, '')}/api/storage/db-images`]: {
        target: 'http://localhost:8080',
        rewrite: (url) => url.replace(new RegExp(`^${basePath.replace(/\/$/, '')}/api`), '/api'),
      },
      [`${basePath.replace(/\/$/, '')}/api`]: {
        target: 'https://talabatiweb-wo8o.onrender.com',
        changeOrigin: true,
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
});

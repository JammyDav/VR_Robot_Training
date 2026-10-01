import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS is mandatory for WebXR on the headset. `--host` (see package.json)
// exposes the dev server on the LAN so the Quest browser can reach it.
// `--mode desktop` serves plain HTTP on localhost for keyboard/mouse testing.
export default defineConfig(({ mode }) => {
  const https = mode !== 'desktop';
  return {
    base: './',
    plugins: https ? [basicSsl()] : [],
    server: { port: https ? 5173 : 5174, strictPort: true },
    preview: { port: 4173 },
    build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  };
});

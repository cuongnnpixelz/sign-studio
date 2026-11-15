import { defineConfig, loadEnv } from 'vite';
import { createHybridApi } from './server/hybridApi.js';

export default defineConfig(({ mode }) => ({
  build: {
    rollupOptions: { input: { main: 'index.html', animationLab: 'asl-animation-lab.html' } }
  },
  plugins: [{
    name: 'sign-studio-hybrid',
    configureServer(server) {
      server.middlewares.use(createHybridApi({ env: { ...loadEnv(mode, process.cwd(), ''), ...process.env } }));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createHybridApi({ env: { ...loadEnv(mode, process.cwd(), ''), ...process.env } }));
    }
  }],
  server: {
    port: 3001,
    strictPort: true,
    open: false,
    host: '127.0.0.1'
  },
  preview: { host: '127.0.0.1' }
}));

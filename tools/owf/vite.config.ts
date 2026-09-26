import { defineConfig } from 'vite';
export default defineConfig({
  root: 'src/web',
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4317',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (outgoing, incoming) => {
            // Preserve rejection of foreign origins through the dev proxy.
            if (incoming.headers.origin === `http://${incoming.headers.host}`)
              outgoing.setHeader('Origin', 'http://127.0.0.1:4317');
          });
        },
      },
    },
  },
  build: { outDir: '../../dist/web', emptyOutDir: true },
});

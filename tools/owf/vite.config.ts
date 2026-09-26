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
            // Translate only the proxy's own origin. A foreign origin may
            // equal the backend origin, so preserving it would bypass the gate.
            outgoing.setHeader(
              'Origin',
              incoming.headers.origin === `http://${incoming.headers.host}`
                ? 'http://127.0.0.1:4317'
                : 'null',
            );
          });
        },
      },
    },
  },
  build: { outDir: '../../dist/web', emptyOutDir: true },
});

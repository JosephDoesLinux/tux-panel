import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:3001',
        ws: true,
        changeOrigin: true,
      },
      '/guacamole': {
        target: 'http://127.0.0.1:3001',
        ws: true,
        changeOrigin: true, // Crucial for Websocket handshakes
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            // This prevents the "write ECONNRESET" from crashing the Vite process
            console.warn('[Vite Proxy Error]:', err.message);
          });
          proxy.on('proxyReqWs', (proxyReq, req, socket, options, head) => {
            // Optional: Log to verify the tunnel is actually hitting the backend
            // console.log('WebSocket Tunneling to:', options.target);
          });
        },
      },
    },
  },
});
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:5050',
        changeOrigin: true,
        ws: true,
      },
      '/me': 'http://127.0.0.1:5050',
      '/session': 'http://127.0.0.1:5050',
      '/upload': 'http://127.0.0.1:5050',
      '/download': 'http://127.0.0.1:5050',
      '/social': 'http://127.0.0.1:5050',
    },
  },
})

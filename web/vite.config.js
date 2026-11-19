import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the page and the API look like one site, exactly as in production
// (where Netlify proxies /api and /uploads to Render). So the frontend always calls
// relative URLs like /api/products and the session cookie just works.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
});

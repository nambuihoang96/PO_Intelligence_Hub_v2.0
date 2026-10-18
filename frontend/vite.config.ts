import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Normal PO Hub: port 8000
// DevCrew UAT: configurable isolated API port
const apiTarget =
  process.env.DEVCREW_UAT_API_TARGET ||
  'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': apiTarget,
    },
  },
});
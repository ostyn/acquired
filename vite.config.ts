import { defineConfig } from 'vite';

const basePath = process.env.BASE_PATH || '/';

export default defineConfig({
  base: basePath,
  server: {
    port: 5173,
    host: true,
  },
});

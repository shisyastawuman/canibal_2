import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Vite-only animation sandbox — no API proxy, opens the lab page. */
export default defineConfig({
  plugins: [react()],
  server: {
    open: '/anim-lab.html',
  },
  build: {
    rollupOptions: {
      input: {
        animLab: resolve(import.meta.dirname, 'anim-lab.html'),
      },
    },
  },
});

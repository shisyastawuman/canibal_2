import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        animLab: resolve(import.meta.dirname, 'anim-lab.html'),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      workbox: { navigateFallbackDenylist: [/^\/api/] },
      manifest: {
        name: 'Caníbal',
        short_name: 'Caníbal',
        lang: 'es',
        display: 'standalone',
        background_color: '#fafafa',
        theme_color: '#222222',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
    }),
  ],
});

import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['piece/*.svg', 'apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: 'Crazyhouse Trainer',
        short_name: 'ZH Trainer',
        description: 'Personal crazyhouse training built from your own Lichess games',
        theme_color: '#221d17',
        background_color: '#16130f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './index.html',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // puzzle data is large; make sure it is precached for offline use
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
  },
});

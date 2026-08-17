import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function git(cmd: string, fallback: string): string {
  try {
    return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

function countOf(file: string): number {
  try {
    return JSON.parse(readFileSync(`./src/data/${file}`, 'utf8')).length;
  } catch {
    return 0;
  }
}

const commit = git('rev-parse --short HEAD', 'dev');
const commitDate = git('log -1 --format=%cd --date=format:%Y-%m-%d', 'unknown');
const dirty = git('status --porcelain', '') !== '' ? '+' : '';

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(`${commitDate}.${commit}${dirty}`),
    __BUILT_AT__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
    __CONTENT__: JSON.stringify({
      puzzles: countOf('puzzles.json'),
      collapses: countOf('defence.json'),
      openings: countOf('explorer.json'),
    }),
  },
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

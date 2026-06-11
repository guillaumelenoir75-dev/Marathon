import { defineConfig } from 'vite';

export default defineConfig({
  root: 'public',
  // public-static/ est copié tel quel dans dist/ sans hashing (manifest, SW, icônes)
  publicDir: '../public-static',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
});

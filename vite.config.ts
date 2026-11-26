import { defineConfig } from 'vite';

// Served from the root of w3map.dev. Set BASE=/<repo>/ to host under a GitHub Pages project path.
export default defineConfig({
  base: process.env.BASE ?? '/',
  build: { chunkSizeWarningLimit: 1200 }, // maplibre-gl alone is ~1 MB
});

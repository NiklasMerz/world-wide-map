import { defineConfig } from 'vite';

// GitHub Pages serves the site under /<repo>/; override with BASE=/ for custom domains.
export default defineConfig({
  base: process.env.BASE ?? '/world-wide-map/',
  build: { chunkSizeWarningLimit: 1200 }, // maplibre-gl alone is ~1 MB
});

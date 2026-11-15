import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Separate sandbox build: never edit the game's root entry or shared build configuration.
export default defineConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  build: {
    outDir: '.local/gfx-dist',
    rollupOptions: {
      input: fileURLToPath(
        new URL('../../sandbox/gfx-pipeline.html', import.meta.url),
      ),
    },
  },
});

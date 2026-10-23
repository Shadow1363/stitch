import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// stage.html runs in a sandboxed iframe (opaque "null" origin), so its module scripts are
// cross-origin requests. Vite blocks the null origin by default; allow it alongside localhost.
// Tradeoff: while the dev server runs, any page's sandboxed iframe can load dev modules.
// Production hosting must send Access-Control-Allow-Origin on stage assets (Phase 6 inlines them).
const cors = { origin: [/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/, 'null'] };

export default defineConfig({
  plugins: [svelte()],
  server: { cors },
  preview: { cors },
  build: {
    target: 'es2022',
    reportCompressedSize: true,
    // Blockly (~940 kB raw) is its own lazily loaded chunk; keep the warning for anything else.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        stage: resolve(import.meta.dirname, 'stage.html'),
        bench: resolve(import.meta.dirname, 'bench.html'),
      },
    },
  },
});

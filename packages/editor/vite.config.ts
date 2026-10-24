import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { buildIife, buildPlayer } from '../export/build';
import { scriptText } from '../export/src/html';

// Under `pnpm dev`, stage.html runs in a sandboxed iframe (opaque "null" origin), so its module
// scripts are cross-origin requests. Vite blocks the null origin by default; allow it alongside
// localhost. Tradeoff: while the dev server runs, any page's sandboxed iframe can load dev
// modules. Builds inline the stage's script (below), so production hosting needs no CORS headers.
const cors = { origin: [/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/, 'null'] };

// The built stage is one inline classic script: nothing to fetch, so `default-src 'none'`.
// It never fetches either: HTTP goes to the editor over postMessage, where permissions and
// secrets apply, and this makes that a rule for extension code too. `unsafe-eval` runs the
// compiled program (`new Function`). Build only, because the dev server's HMR client needs a
// websocket and module scripts from every page.
const STAGE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'media-src blob:',
  "connect-src 'none'",
  'worker-src blob:',
  "form-action 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
].join('; ');
const STAGE_SCRIPT = '<script type="module" src="/src/stage-entry.ts"></script>';
const stageInline = (): Plugin => ({
  name: 'stitch-stage-inline',
  apply: 'build',
  transformIndexHtml: {
    order: 'pre',
    async handler(html, ctx) {
      if (!ctx.filename.endsWith('stage.html')) return html;
      if (!html.includes(STAGE_SCRIPT)) throw new Error('stage.html: stage script tag not found');
      const js = await buildIife(resolve(import.meta.dirname, 'src/stage-entry.ts'), 'StitchStage');
      return html
        .replace(STAGE_SCRIPT, () => `<script>${scriptText(js)}</script>`)
        .replace(
          '<meta charset="utf-8" />',
          `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${STAGE_CSP}" />`,
        );
    },
  },
});

// `import player from 'virtual:stitch-player'` is the exported player bundle as a string, built
// from @stitch/export with the same build as `pnpm check:size`. Exports inline it into pages.
const PLAYER_ID = 'virtual:stitch-player';
const stitchPlayer = (): Plugin => {
  let built: Promise<string> | undefined;
  return {
    name: 'stitch-player',
    resolveId: (id) => (id === PLAYER_ID ? `\0${PLAYER_ID}` : undefined),
    async load(id) {
      if (id !== `\0${PLAYER_ID}`) return undefined;
      built ??= buildPlayer();
      return `export default ${JSON.stringify(await built)};`;
    },
    configureServer(server) {
      // Rebuilt on next use after a change to anything the player bundles.
      server.watcher.on('change', (file) => {
        if (!/packages\/(runtime|cart|export)\/src\//.test(file)) return;
        built = undefined;
        const m = server.moduleGraph.getModuleById(`\0${PLAYER_ID}`);
        if (m) server.moduleGraph.invalidateModule(m);
      });
    },
  };
};

export default defineConfig({
  plugins: [svelte(), stageInline(), stitchPlayer()],
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
        docs: resolve(import.meta.dirname, 'docs.html'),
      },
    },
  },
});

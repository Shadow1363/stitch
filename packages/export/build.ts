/**
 * Builds browser entries into one self-contained classic script (IIFE): no imports, no chunks,
 * so it can be inlined into a page. Used for the exported player and, in production, for the
 * editor's stage iframe, which then makes no cross-origin requests at all.
 * Runs in Node (Vite's build API); not part of any browser bundle.
 */
import { resolve } from 'node:path';
import { build, type Rolldown } from 'vite';

/** The player entry; its bundle is what every export inlines. */
export const PLAYER_ENTRY = resolve(import.meta.dirname, 'src/player/main.ts');

/** The budget for the gzipped player bundle (docs/plan.md, Phase 6). */
export const PLAYER_BUDGET_GZIP = 500 * 1024;

export async function buildIife(entry: string, name: string): Promise<string> {
  const out = await build({
    configFile: false,
    logLevel: 'warn',
    mode: 'production',
    define: { 'import.meta.env.DEV': 'false' },
    build: {
      write: false,
      target: 'es2022',
      minify: true,
      copyPublicDir: false,
      reportCompressedSize: false,
      lib: { entry, formats: ['iife'], name, fileName: () => `${name}.js` },
    },
  });
  const outputs = (Array.isArray(out) ? out : [out]) as Rolldown.RolldownOutput[];
  const chunks = outputs.flatMap((o) => o.output).filter((f) => f.type === 'chunk');
  if (chunks.length !== 1) throw new Error(`${entry}: expected one script, got ${chunks.length}`);
  return chunks[0]!.code;
}

export function buildPlayer(): Promise<string> {
  return buildIife(PLAYER_ENTRY, 'StitchPlayer');
}

/**
 * Examples in the docs. A fenced `stitch` block right after `<!-- example: name -->` is an
 * example; `scripts/docs-blocks.ts` renders it through `toBlocks` and real Blockly to
 * `docs/blocks/<name>.svg`, so the text and the block picture come from one source. Pure, so the
 * docs check (`docs.test.ts`) can verify examples and image freshness in Node. A `json` fence
 * after `<!-- manifest -->` is an extension manifest whose blocks examples may use.
 */
import { CORE_CATALOG, validateModule, type Catalog, type Module } from '@stitch/ir';
import { parse } from '@stitch/lang';
import type { BlockJson } from './json';
import { toBlocks } from './toBlocks';

export interface DocExample {
  name: string;
  code: string;
}

const EXAMPLE = /<!-- example: ([a-z0-9_-]+) -->\s*\n```stitch\n([\s\S]*?)\n```/g;

/** Every example in a markdown file, in order. */
export function examplesIn(markdown: string): DocExample[] {
  return [...markdown.matchAll(EXAMPLE)].map((m) => ({ name: m[1]!, code: m[2]! }));
}

const MANIFEST = /<!-- manifest -->\s*\n```json\n([\s\S]*?)\n```/g;

/** Extension manifests declared in a markdown file, as parsed JSON (validate before use). */
export function manifestsIn(markdown: string): unknown[] {
  return [...markdown.matchAll(MANIFEST)].map((m) => JSON.parse(m[1]!) as unknown);
}

/** FNV-1a of the example text; images carry it so a stale image is caught without a browser. */
export function exampleHash(code: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < code.length; i++) h = Math.imul(h ^ code.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface ExampleResult {
  module: Module;
  /** The snippet was statements, so it was parsed inside `on start do … end`. */
  wrapped: boolean;
  /** Syntax errors and problems other than undeclared variables (snippets may use names
   * declared elsewhere). */
  problems: string[];
}

/** Starts with a top-level item (after comments), rather than statements. */
const ITEM =
  /^(?:\s*--[^\n]*\n|\s*\n)*\s*(?:global\s+var|shared\s+var|var|warp\s+function|function|on)\b/;

/** Parses an example: whole items as written, or statements inside an event script. */
export function parseExample(code: string, catalog: Catalog = CORE_CATALOG): ExampleResult {
  const wrapped = !ITEM.test(code);
  const indented = code
    .split('\n')
    .map((l) => (l ? `  ${l}` : l))
    .join('\n');
  const r = parse(wrapped ? `on start do\n${indented}\nend` : code);
  const problems = [
    ...r.diagnostics.map((d) => d.message),
    ...validateModule(r.module, new Set(), catalog)
      .filter((d) => d.severity === 'error' && !d.message.startsWith('unknown variable'))
      .map((d) => d.message),
  ];
  return { module: r.module, wrapped, problems };
}

/** The blocks an example shows: its items, or for statements just the stack (no hat). */
export function exampleBlocks(code: string, catalog: Catalog = CORE_CATALOG): BlockJson[] {
  const { module, wrapped } = parseExample(code, catalog);
  const blocks = toBlocks(module, {}, catalog);
  if (!wrapped) return blocks;
  const body = blocks[0]?.next?.block;
  return body ? [body] : [];
}

/** Every block type in `blocks`, including nested ones and shadows. */
export function blockTypes(blocks: BlockJson[], out = new Set<string>()): Set<string> {
  for (const b of blocks) {
    out.add(b.type);
    for (const i of Object.values(b.inputs ?? {})) {
      if (i.block) blockTypes([i.block], out);
      if (i.shadow) blockTypes([i.shadow], out);
    }
    if (b.next?.block) blockTypes([b.next.block], out);
  }
  return out;
}

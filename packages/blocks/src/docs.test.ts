/**
 * The docs check (CLAUDE.md, Docs): every builtin, keyword, block type, music effect and cart
 * field has a reference entry; every docs example parses and has a current block picture; and
 * every relative link and anchor in the docs resolves. A new language feature fails here until
 * it's documented.
 */
import {
  DEFAULT_SFX,
  EFFECTS,
  type Cart,
  type CartExtension,
  type Cell,
  type Instrument,
  type PngAsset,
  type SpriteInit,
} from '@stitch/cart';
import {
  BUILTINS,
  createCatalog,
  IR_VERSION,
  validateManifest,
  type ExtensionBlock,
} from '@stitch/ir';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFINITIONS } from './definitions';
import { diagramFile, diagramsIn } from './diagrams';
import {
  blockTypes,
  exampleBlocks,
  exampleHash,
  examplesIn,
  manifestsIn,
  parseExample,
} from './docs';
import { generatedRegions, renderReference, SECTIONS } from './registry';

const root = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/** README, CONTRIBUTING and docs/**.md, except the generated API docs. */
function markdownFiles(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) return p === 'docs/api' ? [] : walk(p);
      return e.name.endsWith('.md') ? [p] : [];
    });
  return ['README.md', 'CONTRIBUTING.md', ...walk('docs')];
}

const reference = read('docs/reference.md');
const docs = markdownFiles().map((path) => ({ path, text: read(path) }));
const examples = docs.flatMap((d) => examplesIn(d.text).map((e) => ({ ...e, path: d.path })));
// Examples may use the sample extension and any manifest a doc declares.
const manifests = [
  JSON.parse(read('packages/editor/public/extensions/text/manifest.json')),
  ...docs.flatMap((d) => manifestsIn(d.text)),
].map((m) => {
  const r = validateManifest(m);
  if (!r.ok) throw new Error(`invalid manifest in the docs: ${r.errors.join('; ')}`);
  return r.manifest;
});
const catalog = createCatalog(manifests);

/** GitHub's heading anchors. */
const slug = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');

const headings = reference.match(/^#{2,4} .*$/gm) ?? [];

describe('reference', () => {
  it('has an entry for every builtin', () => {
    const missing = [...BUILTINS.values()]
      .filter((b) => !headings.some((h) => h.startsWith(`### \`${b.name}(`)))
      .map((b) => b.name);
    expect(missing).toEqual([]);
  });

  it('is generated from the registry (run `pnpm docs:reference`)', () => {
    expect(renderReference(reference) === reference).toBe(true);
    expect(generatedRegions(reference)).toEqual(SECTIONS.map((s) => s.id));
  });

  it('lists every keyword', () => {
    const grammar = read('packages/lang/src/stitch.grammar');
    const keywords = new Set([...grammar.matchAll(/c?kw<"(\w+)">/g)].map((m) => m[1]!));
    const missing = [...keywords].filter((k) => !reference.includes(`| \`${k}\` |`));
    expect(keywords.size).toBeGreaterThan(20);
    expect(missing).toEqual([]);
  });

  it('shows every block type in an example', () => {
    const shown = new Set<string>();
    for (const e of examples.filter((x) => x.path === 'docs/reference.md'))
      blockTypes(exampleBlocks(e.code, catalog), shown);
    const all = [...DEFINITIONS.map((d) => d.type as string), 'controls_if', 'lists_create_with'];
    expect(all.filter((t) => !shown.has(t))).toEqual([]);
  });

  it('lists every music effect', () => {
    const codes = EFFECTS.map((e) => e.label.split(' ')[0]!);
    expect(codes.filter((c) => !reference.includes(`| \`${c}\` |`))).toEqual([]);
  });
});

describe('examples', () => {
  it('parse and validate (raw-code examples may not)', () => {
    const bad = examples
      .filter((e) => !e.name.startsWith('raw'))
      .flatMap((e) =>
        parseExample(e.code, catalog).problems.map((p) => `${e.path} ${e.name}: ${p}`),
      );
    expect(bad).toEqual([]);
    expect(examples.length).toBeGreaterThan(60);
  });

  it('have unique names and current pictures (run `pnpm docs:blocks`)', () => {
    const names = examples.map((e) => e.name);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
    const stale = examples.filter((e) => {
      const file = join(root, 'docs/blocks', `${e.name}.svg`);
      return (
        !existsSync(file) ||
        !readFileSync(file, 'utf8').includes(`data-source-hash="${exampleHash(e.code)}"`)
      );
    });
    expect(stale.map((e) => `${e.path} ${e.name}`)).toEqual([]);
    const orphans = readdirSync(join(root, 'docs/blocks')).filter(
      (f) => !names.includes(f.replace(/\.svg$/, '')),
    );
    expect(orphans).toEqual([]);
  });
});

describe('diagrams', () => {
  it('have current pictures in both themes (run `pnpm docs:diagrams`)', () => {
    const texts = docs.flatMap((d) => diagramsIn(d.text));
    const wanted = texts.flatMap((t) => [diagramFile(t, 'light'), diagramFile(t, 'dark')]);
    expect(wanted.filter((f) => !existsSync(join(root, f)))).toEqual([]);
    const dir = join(root, 'docs/diagrams');
    const orphans = existsSync(dir)
      ? readdirSync(dir).filter((f) => !wanted.includes(`docs/diagrams/${f}`))
      : [];
    expect(orphans).toEqual([]);
  });
});

describe('links', () => {
  it('resolve to files and headings that exist', () => {
    const broken: string[] = [];
    for (const d of docs) {
      const text = d.text.replace(/```[\s\S]*?```/g, '');
      const targets = [
        ...[...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]!),
        ...[...text.matchAll(/\ssrc="([^"]+)"/g)].map((m) => m[1]!),
      ];
      for (const t of targets) {
        if (/^[a-z]+:/.test(t)) continue;
        const [file, anchor] = t.split('#') as [string, string | undefined];
        const target = file ? relative(root, resolve(join(root, dirname(d.path)), file)) : d.path;
        if (!existsSync(join(root, target))) {
          broken.push(`${d.path}: ${t}`);
          continue;
        }
        if (anchor && target.endsWith('.md')) {
          const anchors = (read(target).match(/^#{1,6} .*$/gm) ?? []).map((h) =>
            slug(h.replace(/^#+ /, '')),
          );
          if (!anchors.includes(anchor)) broken.push(`${d.path}: ${t}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});

/**
 * A cart with every field filled in. `Required<…>` makes a new field a type error here until
 * it's added, and the test then asks for it in cart-format.md.
 */
const BLOCK: Required<ExtensionBlock> = {
  name: 'x_y',
  kind: 'reporter',
  label: '%1',
  description: 'd',
  params: [{ name: 'a', type: 'any', default: 1 }],
  returns: 'any',
  waits: true,
};
const EXTENSION: CartExtension = {
  manifest: {
    id: 'x',
    name: 'X',
    version: '1',
    description: '',
    color: '#000000',
    main: 'x.js',
    blocks: [BLOCK],
  },
  code: '',
};
const SPRITE: Required<SpriteInit> = {
  id: 's',
  name: 'S',
  x: 0,
  y: 0,
  direction: 90,
  size: 100,
  visible: true,
  layer: 0,
  costumes: [],
  costume: 1,
};
const PNG: Required<PngAsset> = {
  kind: 'png',
  name: 'a',
  center: [0, 0],
  data: '',
  pixelArt: false,
};
const CELL: Required<Cell> = { note: 60, inst: 'i', vol: 64, fx: '000' };
const INSTRUMENT: Required<Instrument> = {
  name: 'i',
  wave: 'sample',
  sound: 's',
  attack: 0,
  decay: 0,
  sustain: 1,
  release: 0,
  volume: 1,
};
const CART: Required<Cart> = {
  format: 'stitch-cart',
  version: 7,
  meta: { title: 't', author: 'a' },
  stage: {
    width: 480,
    height: 360,
    origin: 'center',
    yAxis: 'up',
    scaling: { mode: 'fit', filter: 'smooth' },
    background: '#ffffff',
    cloneLimit: 300,
  },
  project: {
    irVersion: IR_VERSION,
    stage: { items: [] },
    sprites: [{ id: 's', name: 'S', module: { items: [] } }],
  },
  sprites: [SPRITE],
  backdrops: ['a'],
  backdrop: 1,
  palette: [],
  assets: {
    a: PNG,
    b: {
      kind: 'pixel',
      name: 'b',
      center: [0, 0],
      width: 1,
      height: 1,
      layers: [{ name: 'l', visible: true, data: '' }],
    },
    c: { kind: 'svg', name: 'c', center: [0, 0], svg: '' },
  },
  map: { tileset: 'b', tileSize: 16, width: 1, height: 1, tiles: '' },
  sounds: {
    s: { kind: 'sfx', name: 's', params: { ...DEFAULT_SFX } },
    r: { kind: 'sample', name: 'r', rate: 22050, data: '' },
  },
  music: {
    channels: 4,
    instruments: { i: INSTRUMENT },
    patterns: { p: { name: 'p', rows: 1, cells: [[CELL]] } },
    songs: { g: { name: 'g', bpm: 120, order: ['p'], loop: true } },
  },
  extensions: [EXTENSION],
  editor: { files: { s: { layout: { n: { x: 0, y: 0 } }, loose: [] } } },
};

/** Keyed by ids, not field names: their values' fields are documented, not their keys. */
const RECORDS = new Set([
  'assets',
  'sounds',
  'instruments',
  'patterns',
  'songs',
  'files',
  'layout',
]);

function fields(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) fields(x, out);
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      if (RECORDS.has(k) && x && typeof x === 'object')
        for (const y of Object.values(x)) fields(y, out);
      else fields(x, out);
    }
  return out;
}

describe('cart format', () => {
  it('documents every cart field', () => {
    const spec = read('docs/cart-format.md');
    // The IR inside `project` is documented by the language reference and nodes.ts.
    const all = [...fields(CART)].filter((f) => !['items'].includes(f));
    expect(all.filter((f) => !spec.includes(`\`${f}\``))).toEqual([]);
  });
});

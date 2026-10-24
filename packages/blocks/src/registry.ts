/**
 * The docs registry: prose and an example for every builtin, sprite property and language
 * construct, in reference order. With the catalog (what can be called) and `labels.ts` (block
 * text) it is the one source for completions, signature help and hover docs in the code editor,
 * the generated sections of docs/reference.md (`pnpm docs:reference`) and the Examples cart.
 * `registry.test.ts` fails when a builtin, sprite property or keyword has no entry.
 */
import {
  CORE_CATALOG,
  isSpriteProp,
  SPRITE_PROPS,
  type Builtin,
  type Catalog,
  type ValueType,
} from '@stitch/ir';
import { colourOf } from './definitions';
import { labelOf } from './labels';
import { builtinVariables } from './reference/builtin-variables';
import { clones } from './reference/clones';
import { control } from './reference/control';
import { data } from './reference/data';
import { debug } from './reference/debug';
import { events } from './reference/events';
import { functions } from './reference/functions';
import { gridsAndDictionaries } from './reference/grids-and-dictionaries';
import { listsAndText } from './reference/lists-and-text';
import { looks } from './reference/looks';
import { map } from './reference/map';
import { math } from './reference/math';
import { messages } from './reference/messages';
import { motion } from './reference/motion';
import { operators } from './reference/operators';
import { pen } from './reference/pen';
import { programsAndFiles } from './reference/programs-and-files';
import { rawCode } from './reference/raw-code';
import { sensing } from './reference/sensing';
import { sound } from './reference/sound';
import { text } from './reference/text';
import { timing } from './reference/timing';
import { values } from './reference/values';
import { variableKinds } from './reference/variable-kinds';
import { variables } from './reference/variables';

/** Who has their own copy of a built-in variable. */
export type Scope = 'clone' | 'sprite' | 'global';

export const SCOPE_TEXT: Record<Scope, string> = {
  clone: 'each sprite and clone',
  sprite: 'each sprite and its clones together',
  global: 'the whole program',
};

/** One `###` entry of the reference. */
export interface DocEntry {
  /**
   * A builtin's or sprite property's name, or a construct's id. Also the example's name, so its
   * block picture is `docs/blocks/<id>.svg`.
   */
  id: string;
  /** Heading for constructs and properties; a builtin's heading comes from the catalog. */
  title?: string;
  /** Markdown. The first sentence is the one-line summary. */
  doc: string;
  /** Stitch text: whole items, or statements (shown as a stack without a hat). */
  example: string;
  /** Describes the block picture. */
  alt: string;
  /** Constructs: what completion inserts. `${name}` is a tab stop, `${}` the final cursor. */
  snippet?: string;
  /** Grammar keywords this entry documents, for hover. */
  keywords?: string[];
  /** Built-in variables (sprite properties and reporters without parameters). */
  scope?: Scope;
}

/** A `##` section. Its intro stays hand-written in reference.md; its entries are generated. */
export interface DocSection {
  /** The anchor of its `##` heading, and the name of its generated region. */
  id: string;
  title: string;
  entries: DocEntry[];
}

/** Every section with entries, in reference order. */
export const SECTIONS: readonly DocSection[] = [
  programsAndFiles,
  values,
  variables,
  variableKinds,
  builtinVariables,
  events,
  control,
  functions,
  operators,
  motion,
  looks,
  sound,
  messages,
  timing,
  clones,
  sensing,
  map,
  pen,
  math,
  listsAndText,
  text,
  gridsAndDictionaries,
  data,
  debug,
  rawCode,
];

const ENTRIES = new Map<string, DocEntry>(SECTIONS.flatMap((s) => s.entries.map((e) => [e.id, e])));

export const docEntry = (id: string): DocEntry | undefined => ENTRIES.get(id);

/** Constructs with a completion snippet. */
export const SNIPPETS: readonly DocEntry[] = SECTIONS.flatMap((s) =>
  s.entries.filter((e) => e.snippet !== undefined),
);

/** The entry that documents a grammar keyword. */
export function keywordEntry(keyword: string): DocEntry | undefined {
  for (const s of SECTIONS) for (const e of s.entries) if (e.keywords?.includes(keyword)) return e;
  return undefined;
}

/** The first sentence of an entry's prose, on one line. Full stops inside `code` don't count. */
export function summaryOf(doc: string): string {
  const flat = doc.replace(/\s+/g, ' ').trim();
  let code = false;
  for (let i = 0; i < flat.length; i++) {
    const c = flat[i];
    if (c === '`') code = !code;
    else if (!code && '.!?'.includes(c!) && (i + 1 === flat.length || flat[i + 1] === ' '))
      return flat.slice(0, i + 1);
  }
  return flat;
}

/** `move(steps)`. */
export const signatureOf = (b: Builtin): string =>
  `${b.name}(${b.params.map((p) => p.name).join(', ')})`;

/** The block text with parameter names in its slots: `move (steps) steps`. */
export const blockTextOf = (b: Builtin): string =>
  labelOf(b).replace(/%(\d+)/g, (_, n: string) => `(${b.params[Number(n) - 1]?.name ?? '?'})`);

/** A builtin's `###` heading: `move(steps)` — command. */
export const headingOf = (b: Builtin): string =>
  `\`${signatureOf(b)}\` — ${b.kind}${b.yields ? ', waits' : ''}`;

/** GitHub's anchor for a heading. */
export function anchorOf(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** Everything the editor shows about one name: hover, completion details, signature help. */
export interface Described {
  name: string;
  kind: 'command' | 'reporter' | 'property' | 'construct';
  /** `move(steps)`, `x`, or the construct's heading text. */
  signature: string;
  params?: { name: string; type: ValueType }[];
  /** Block text with parameter names in the slots. */
  blockText?: string;
  /** Block colour, for a small block-shaped preview. */
  colour?: string;
  returns?: ValueType;
  yields?: boolean;
  scope?: Scope;
  writable?: boolean;
  summary: string;
  doc: string;
  example?: string;
  /** Link into docs/reference.md. */
  anchor?: string;
  /** Extension blocks: the extension's name. */
  extension?: string;
}

/** Describes a builtin (core or extension), a sprite property or a keyword, or undefined. */
export function describe(name: string, catalog: Catalog = CORE_CATALOG): Described | undefined {
  const b = catalog.get(name);
  if (b) {
    const e = b.ext ? undefined : ENTRIES.get(b.name);
    const doc = e?.doc ?? b.ext?.description ?? '';
    return {
      name,
      kind: b.kind,
      signature: signatureOf(b),
      params: b.params.map((p) => ({ name: p.name, type: p.type })),
      blockText: blockTextOf(b),
      colour: colourOf(b),
      ...(b.returns ? { returns: b.returns } : {}),
      ...(b.yields ? { yields: true } : {}),
      ...(e?.scope ? { scope: e.scope, writable: false } : {}),
      summary: summaryOf(doc) || blockTextOf(b),
      doc,
      ...(e ? { example: e.example, anchor: anchorOf(headingOf(b)) } : {}),
      ...(b.ext ? { extension: b.ext.name } : {}),
    };
  }
  if (isSpriteProp(name)) {
    const e = ENTRIES.get(name);
    return {
      name,
      kind: 'property',
      signature: name,
      returns: SPRITE_PROPS[name].type,
      scope: 'clone',
      writable: SPRITE_PROPS[name].writable,
      colour: colourOf({ category: 'motion' } as Builtin),
      summary: e ? summaryOf(e.doc) : '',
      doc: e?.doc ?? '',
      ...(e ? { example: e.example, anchor: anchorOf(e.title ?? name) } : {}),
    };
  }
  const e = keywordEntry(name);
  if (e)
    return {
      name,
      kind: 'construct',
      signature: (e.title ?? name).replace(/ — .*$/, '').replace(/`/g, ''),
      summary: summaryOf(e.doc),
      doc: e.doc,
      example: e.example,
      anchor: anchorOf(e.title ?? e.id),
    };
  return undefined;
}

/** Built-in variables: sprite properties, then reporters without parameters that have a scope. */
export function builtinVariableNames(catalog: Catalog = CORE_CATALOG): string[] {
  return [
    ...Object.keys(SPRITE_PROPS),
    ...catalog.all
      .filter((b) => b.kind === 'reporter' && !b.params.length && ENTRIES.get(b.name)?.scope)
      .map((b) => b.name),
  ];
}

// ---- reference.md ----

const REGION = /<!-- generated: ([a-z0-9-]+) -->\n[\s\S]*?<!-- \/generated -->/g;

/** The heading for an entry: from the catalog for builtins, its own title otherwise. */
export function entryHeading(e: DocEntry, catalog: Catalog = CORE_CATALOG): string {
  const b = catalog.get(e.id);
  return b && !e.title ? headingOf(b) : (e.title ?? e.id);
}

function renderEntry(e: DocEntry): string {
  return [
    `### ${entryHeading(e)}`,
    ...(e.doc ? [e.doc] : []),
    `<table><tr><td>`,
    `<!-- example: ${e.id} -->\n\`\`\`stitch\n${e.example}\n\`\`\``,
    `</td><td><img src="blocks/${e.id}.svg" alt="${e.alt.replace(/"/g, '&quot;')}"></td></tr></table>`,
  ].join('\n\n');
}

/** The summary table of built-in variables: type, scope and whether code can set it. */
function renderVariableTable(): string {
  const rows = builtinVariableNames().map((name) => {
    const d = describe(name)!;
    const call = d.kind === 'property' ? name : `${name}()`;
    return `| [\`${call}\`](#${d.anchor}) | ${d.returns} | ${SCOPE_TEXT[d.scope!]} | ${d.writable ? 'read and write' : 'read-only'} | ${d.summary} |`;
  });
  return [
    '| Name | Type | One value for | Access | What it is |',
    '|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

function renderSection(id: string): string {
  const s = SECTIONS.find((x) => x.id === id);
  if (!s) throw new Error(`reference.md has a generated region '${id}' that the registry lacks`);
  const parts = s === builtinVariables ? [renderVariableTable()] : [];
  return [...parts, ...s.entries.map(renderEntry)].join('\n\n');
}

/**
 * docs/reference.md with every `<!-- generated: id -->` region rewritten from the registry. The
 * docs check fails when this differs from the file, and `pnpm docs:reference` writes it.
 */
export function renderReference(markdown: string): string {
  return markdown.replace(
    REGION,
    (_, id: string) => `<!-- generated: ${id} -->\n\n${renderSection(id)}\n\n<!-- /generated -->`,
  );
}

/** The ids of the generated regions in a markdown file. */
export function generatedRegions(markdown: string): string[] {
  return [...markdown.matchAll(REGION)].map((m) => m[1]!);
}

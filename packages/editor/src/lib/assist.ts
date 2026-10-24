/**
 * What the code editor suggests and explains, as plain data: completion items, signature help
 * and hover content, built from the registry (`@stitch/blocks/registry`: catalog, labels and
 * docs) plus the cart's own names. Pure, so it's tested in Node; `assist-view.ts` draws it and
 * `@stitch/lang/codemirror` wires it into CodeMirror. A new builtin, block or extension appears
 * here with no change to this file.
 */
import { describe, SNIPPETS, type Described } from '@stitch/blocks/registry';
import { REF_WORDS, SPRITE_PROPS, type Builtin, type CartNames, type Catalog } from '@stitch/ir';
import type { CallSite, CursorContext, NameKind, ScopeName } from '@stitch/lang/assist';

/** The cart around the file being edited. */
export interface AssistData {
  catalog: Catalog;
  names: CartNames;
  /** Every message name broadcast or received in any file. */
  messages: readonly string[];
  /** Global variables declared in other files, with the file that declares them. */
  globals: readonly { name: string; file: string }[];
  /** The file's sprite, for its costume names; undefined in the stage file. */
  sprite?: string;
}

/** A user-declared name, as the info panel shows it. */
export interface UserInfo {
  name: string;
  kind: NameKind;
  params?: string[];
  /** Another file that declares it. */
  file?: string;
}

export interface Item {
  /** What the typed word is matched against. */
  label: string;
  /** Shown instead of the label (e.g. a block-text alias shows the real name). */
  displayLabel?: string;
  type: 'keyword' | 'function' | 'variable' | 'property' | 'constant' | 'text' | 'event';
  detail?: string;
  /** CodeMirror snippet: `${name}` is a tab stop, `${}` the final cursor. Plain text otherwise. */
  snippet?: string;
  boost?: number;
  info?: { builtin: Described } | { user: UserInfo };
}

export const KIND_TEXT: Record<NameKind, string> = {
  global: 'global var',
  shared: 'shared var (sprite and clones)',
  sprite: 'var (one per clone)',
  local: 'local',
  param: 'parameter',
  loop: 'loop variable',
  function: 'function',
};

/** `name(${a}, ${b})`: a call with a tab stop per parameter. */
export const callSnippet = (name: string, params: readonly string[]) =>
  `${name}(${params.map((p) => '${' + p + '}').join(', ')})`;

/** Top-level constructs, and the statements a body can start with. */
const TOP = [
  'var',
  'global-var',
  'shared-var',
  'function',
  'warp-function',
  'on-start',
  'on-key',
  'on-message',
  'on-clone',
  'on-click',
];
const EVENTS = TOP.filter((id) => id.startsWith('on-'));

/** A snippet's first line with tab stops filled in, as its label: `for i = 1, 10 do`. */
const snippetLabel = (snippet: string) =>
  snippet
    .split('\n')[0]!
    .replace(/\$\{([^}]*)\}/g, '$1')
    .trim();

function constructItems(ids: (id: string) => boolean, strip = ''): Item[] {
  return SNIPPETS.filter((e) => ids(e.id)).map((e) => {
    const snippet = e.snippet!.slice(strip.length);
    const d = describe(e.keywords?.[0] ?? e.id);
    return {
      label: snippetLabel(snippet),
      type: strip ? 'event' : 'keyword',
      ...(e.title?.includes(' — ') ? { detail: e.title.replace(/^.*— /, '') } : {}),
      snippet,
      boost: 1,
      ...(d ? { info: { builtin: d } } : {}),
    };
  });
}

function builtinItems(catalog: Catalog, want: (b: Builtin) => boolean): Item[] {
  const out: Item[] = [];
  for (const b of catalog.all) {
    if (!want(b)) continue;
    const d = describe(b.name, catalog)!;
    const item: Item = {
      label: b.name,
      type: 'function',
      detail: d.blockText,
      snippet: callSnippet(
        b.name,
        b.params.map((p) => p.name),
      ),
      info: { builtin: d },
    };
    out.push(item);
    // Scratch users think in block text: "pick" finds `random` ("pick random … to …").
    const alias = d
      .blockText!.split(/\s*\(/)[0]!
      .replace(/[^\p{L}\p{N} ]/gu, '')
      .trim()
      .toLowerCase();
    if (alias && !alias.replace(/ /g, '_').startsWith(b.name) && alias !== b.name)
      out.push({ ...item, label: alias, displayLabel: `${b.name} — ${alias}`, boost: -1 });
  }
  return out;
}

function userItems(scope: readonly ScopeName[], data: AssistData, functions: boolean): Item[] {
  const seen = new Set<string>();
  const out: Item[] = [];
  const all: (ScopeName | { name: string; kind: NameKind; file: string })[] = [
    ...scope,
    ...data.globals.map((g) => ({ name: g.name, kind: 'global' as const, file: g.file })),
  ];
  for (const s of all) {
    if (seen.has(s.name) || (s.kind === 'function' && !functions)) continue;
    seen.add(s.name);
    const info: UserInfo = {
      name: s.name,
      kind: s.kind,
      ...('params' in s && s.params ? { params: s.params } : {}),
      ...('file' in s ? { file: s.file } : {}),
    };
    out.push(
      s.kind === 'function'
        ? {
            label: s.name,
            type: 'function',
            detail: `function ${s.name}(${info.params?.join(', ') ?? ''})`,
            snippet: callSnippet(s.name, info.params ?? []),
            boost: 2,
            info: { user: info },
          }
        : {
            label: s.name,
            type: 'variable',
            detail: KIND_TEXT[s.kind],
            boost: 2,
            info: { user: info },
          },
    );
  }
  return out;
}

const propItems = (): Item[] =>
  Object.keys(SPRITE_PROPS).map((p) => ({
    label: p,
    type: 'property',
    detail: SPRITE_PROPS[p as keyof typeof SPRITE_PROPS].writable
      ? 'sprite property'
      : 'sprite property, read-only',
    boost: 1,
    info: { builtin: describe(p)! },
  }));

const words = (list: readonly string[], detail: string): Item[] =>
  [...new Set(list)].map((w) => ({ label: w, type: 'text', detail }));

/** Names a string argument can take, from its parameter's `ref`. */
function stringItems(call: CallSite | undefined, data: AssistData): Item[] {
  const p = call ? data.catalog.get(call.name)?.params[call.arg] : undefined;
  if (!p?.ref) return [];
  const { names } = data;
  switch (p.ref) {
    case 'sprite':
      return [...words(names.sprites, 'sprite'), ...words(REF_WORDS.sprite, 'special target')];
    case 'costume':
      return words(data.sprite !== undefined ? (names.costumes[data.sprite] ?? []) : [], 'costume');
    case 'sound':
      return words(names.sounds, 'sound');
    case 'song':
      return words(names.songs, 'song');
    case 'message':
      return words(data.messages, 'message');
    case 'key':
      return words(REF_WORDS.key, 'key');
    case 'effect':
      return words(REF_WORDS.effect, 'effect');
    case 'rotation':
      return words(REF_WORDS.rotation, 'rotation style');
  }
}

/** Completion items for the cursor's context. */
export function completions(
  ctx: CursorContext,
  scope: readonly ScopeName[],
  data: AssistData,
): Item[] {
  switch (ctx.kind) {
    case 'none':
      return [];
    case 'top':
      return constructItems((id) => TOP.includes(id));
    case 'event':
      return constructItems((id) => EVENTS.includes(id), 'on ');
    case 'string':
      if (ctx.event === 'key') return words(REF_WORDS.key, 'key');
      if (ctx.event === 'message') return words(data.messages, 'message');
      return stringItems(ctx.call, data);
    case 'statement':
      return [
        ...constructItems((id) => !TOP.includes(id)),
        ...builtinItems(data.catalog, (b) => b.kind === 'command'),
        ...userItems(scope, data, true),
        ...propItems(),
      ];
    case 'expr':
      return [
        ...builtinItems(data.catalog, (b) => b.kind === 'reporter'),
        ...userItems(scope, data, true),
        ...propItems(),
        ...['true', 'false', 'not', 'and', 'or'].map((k): Item => ({ label: k, type: 'keyword' })),
      ];
  }
}

/** Signature help: the called name's parameters, with the one being typed marked. */
export interface Signature {
  name: string;
  params: string[];
  active: number;
  blockText?: string;
  summary?: string;
  colour?: string;
}

export function signature(
  call: CallSite,
  scope: readonly ScopeName[],
  data: AssistData,
): Signature | undefined {
  const d = describe(call.name, data.catalog);
  if (d?.params)
    return {
      name: call.name,
      params: d.params.map((p) => p.name),
      active: call.arg,
      ...(d.blockText ? { blockText: d.blockText } : {}),
      summary: d.summary,
      ...(d.colour ? { colour: d.colour } : {}),
    };
  const f = scope.find((s) => s.kind === 'function' && s.name === call.name);
  return f ? { name: f.name, params: f.params ?? [], active: call.arg } : undefined;
}

/** What hovering a name shows: the innermost user declaration, else the registry's entry. */
export function hoverInfo(
  name: string,
  scope: readonly ScopeName[],
  data: AssistData,
): Item['info'] | undefined {
  const s = scope.find((x) => x.name === name);
  if (s) return { user: { name, kind: s.kind, ...(s.params ? { params: s.params } : {}) } };
  const g = data.globals.find((x) => x.name === name);
  if (g) return { user: { name, kind: 'global', file: g.file } };
  const d = describe(name, data.catalog);
  return d ? { builtin: d } : undefined;
}

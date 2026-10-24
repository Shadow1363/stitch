import { BUILTINS, type Builtin, type ValueType } from './builtins';

/**
 * An extension's manifest: pure data, read by the editor to extend the catalog and the toolbox.
 * The extension's code never runs in the editor; the stage evaluates it inside the sandbox.
 */
export interface ExtensionManifest {
  /** Lowercase letters and digits. Every block name starts with `<id>_`. */
  id: string;
  name: string;
  version: string;
  description?: string;
  /** Block and toolbox colour, `#rrggbb`. */
  color: string;
  /** Code URL relative to the manifest, used when loading an extension from a URL. */
  main?: string;
  blocks: ExtensionBlock[];
}

export interface ExtensionBlock {
  name: string;
  kind: 'command' | 'reporter';
  /** Block text; `%n` is the nth parameter (1-based), as in the core labels. */
  label: string;
  /** One line for hover docs and completions. */
  description?: string;
  params: { name: string; type: ValueType; default?: number | string }[];
  /** Reporters only; defaults to `any`. */
  returns?: ValueType;
  /** The implementation may return a Promise; the calling thread waits for it across ticks. */
  waits?: boolean;
}

export type ManifestResult =
  { ok: true; manifest: ExtensionManifest } | { ok: false; errors: string[] };

const ID = /^[a-z][a-z0-9]{0,23}$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const TYPES = new Set<ValueType>(['number', 'string', 'boolean', 'list', 'any']);

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Checks an untrusted manifest and returns a clean copy (unknown fields dropped). */
export function validateManifest(input: unknown): ManifestResult {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ['manifest must be a JSON object'] };
  const str = (key: string, required = true): string | undefined => {
    const v = input[key];
    if (typeof v === 'string' && v.trim() !== '') return v;
    if (required || v !== undefined) errors.push(`'${key}' must be a non-empty string`);
    return undefined;
  };
  const id = str('id');
  if (id !== undefined && !ID.test(id))
    errors.push(`'id' must be lowercase letters and digits, starting with a letter (got '${id}')`);
  const name = str('name');
  const version = str('version');
  const description = str('description', false);
  const main = str('main', false);
  const color = str('color');
  if (color !== undefined && !COLOR.test(color)) errors.push(`'color' must look like #4c97ff`);

  const blocks: ExtensionBlock[] = [];
  if (!Array.isArray(input.blocks) || input.blocks.length === 0)
    errors.push(`'blocks' must be a non-empty array`);
  else {
    const seen = new Set<string>();
    input.blocks.forEach((raw, i) => {
      const b = block(raw, `blocks[${i}]`, id, errors);
      if (!b) return;
      if (seen.has(b.name)) errors.push(`blocks[${i}]: '${b.name}' is defined twice`);
      seen.add(b.name);
      blocks.push(b);
    });
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    manifest: {
      id: id!,
      name: name!,
      version: version!,
      ...(description !== undefined ? { description } : {}),
      color: color!.toLowerCase(),
      ...(main !== undefined ? { main } : {}),
      blocks,
    },
  };
}

function block(
  raw: unknown,
  at: string,
  id: string | undefined,
  errors: string[],
): ExtensionBlock | undefined {
  const start = errors.length;
  const err = (m: string) => errors.push(`${at}: ${m}`);
  if (!isObj(raw)) {
    err('must be an object');
    return undefined;
  }
  const name = typeof raw.name === 'string' ? raw.name : '';
  if (!NAME.test(name)) err(`'name' must be an identifier`);
  else if (id !== undefined && !name.startsWith(`${id}_`))
    err(`'${name}' must start with '${id}_'`);
  else if (BUILTINS.has(name)) err(`'${name}' is a core builtin`);
  const kind = raw.kind;
  if (kind !== 'command' && kind !== 'reporter') err(`'kind' must be 'command' or 'reporter'`);
  const params: ExtensionBlock['params'] = [];
  if (!Array.isArray(raw.params)) err(`'params' must be an array`);
  else
    raw.params.forEach((p, j) => {
      if (!isObj(p) || typeof p.name !== 'string' || !NAME.test(p.name))
        return err(`params[${j}] needs an identifier 'name'`);
      const type = (p.type ?? 'any') as ValueType;
      if (!TYPES.has(type)) return err(`params[${j}]: unknown type '${String(p.type)}'`);
      const d = p.default;
      if (d !== undefined && typeof d !== 'number' && typeof d !== 'string')
        return err(`params[${j}]: 'default' must be a number or string`);
      params.push({ name: p.name, type, ...(d !== undefined ? { default: d } : {}) });
    });
  const label = typeof raw.label === 'string' && raw.label.trim() !== '' ? raw.label : '';
  if (!label) err(`'label' must be a non-empty string`);
  else {
    const used = [...label.matchAll(/%(\d+)/g)].map((m) => Number(m[1])).sort((a, c) => a - c);
    const want = params.map((_, j) => j + 1);
    if (used.join() !== want.join())
      err(`'label' must use each of ${want.map((n) => `%${n}`).join(' ') || 'no %n'} once`);
  }
  const returns = raw.returns as ValueType | undefined;
  if (returns !== undefined && (kind !== 'reporter' || !TYPES.has(returns)))
    err(`'returns' is a value type, for reporters only`);
  if (raw.waits !== undefined && typeof raw.waits !== 'boolean') err(`'waits' must be a boolean`);
  const description =
    typeof raw.description === 'string' && raw.description.trim() !== ''
      ? raw.description
      : undefined;
  if (raw.description !== undefined && description === undefined)
    err(`'description' must be a non-empty string`);
  if (errors.length > start) return undefined;
  return {
    name,
    kind: kind as ExtensionBlock['kind'],
    label,
    ...(description !== undefined ? { description } : {}),
    params,
    ...(kind === 'reporter' ? { returns: returns ?? 'any' } : {}),
    ...(raw.waits === true ? { waits: true } : {}),
  };
}

/** Catalog entries for a validated manifest. */
export function extensionBuiltins(m: ExtensionManifest): Builtin[] {
  return m.blocks.map((b) => ({
    name: b.name,
    kind: b.kind,
    category: 'extension',
    params: b.params.map((p) => ({ name: p.name, type: p.type })),
    ...(b.returns ? { returns: b.returns } : {}),
    ...(b.waits ? { yields: true } : {}),
    // The implementation gets a read-only view of the calling sprite.
    sprite: true,
    ext: {
      id: m.id,
      name: m.name,
      color: m.color,
      label: b.label,
      ...(b.description !== undefined ? { description: b.description } : {}),
      defaults: b.params.map((p) => p.default),
    },
  }));
}

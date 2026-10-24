import type { CartExtension } from '@stitch/cart';
import { settle, type HttpResponse, type NetOut } from './net';
import type { Sprite } from './sprite';
import type { Value } from './values';

/** What the stage needs to run one extension; the editor sends it in the load payload. */
export interface ExtensionSource {
  id: string;
  /** Script body, called as `new Function('stitch', code)(api)`. */
  code: string;
  /** Every block the manifest declares; `waits` blocks may return a Promise. */
  blocks: { name: string; waits: boolean }[];
}

/** The stage's view of a cart extension: its code and which blocks may wait. */
export function extensionSource(ext: CartExtension): ExtensionSource {
  return {
    id: ext.manifest.id,
    code: ext.code,
    blocks: ext.manifest.blocks.map((b) => ({ name: b.name, waits: b.waits === true })),
  };
}

/** Read-only view of the calling sprite, passed last to every implementation. */
export interface ExtensionContext {
  sprite: {
    readonly name: string;
    readonly x: number;
    readonly y: number;
    readonly direction: number;
    readonly size: number;
    readonly visible: boolean;
    /** 1-based, like `costume_number`. */
    readonly costume: number;
  };
}

/** The `stitch` object extension code receives. */
export interface ExtensionApi {
  /** Implements a block named in the manifest. Arguments come first, then the context. */
  define(name: string, fn: (...args: never[]) => unknown): void;
  log(text: unknown): void;
  /** HTTP through the editor, under the same permissions and secrets as `http_get`. */
  http(method: 'GET' | 'POST', url: string, body?: string): Promise<HttpResponse>;
}

/** Compiled-code calling convention: the sprite first; `waits` blocks are generators. */
type Impl = (S: Sprite, ...args: Value[]) => unknown;

export interface LoadedExtensions {
  impls: Record<string, Impl>;
  errors: { id: string; message: string }[];
}

/**
 * Runs each extension's code once and collects its block implementations. An extension that
 * throws, or leaves a manifest block undefined, still gets every block: calling one reports
 * why it failed, instead of a bare "not a function".
 */
export function loadExtensions(
  sources: readonly ExtensionSource[],
  deps: { net: NetOut; log: (id: string, text: string) => void },
): LoadedExtensions {
  const impls: Record<string, Impl> = {};
  const errors: LoadedExtensions['errors'] = [];
  for (const src of sources) {
    const fns = new Map<string, (...args: unknown[]) => unknown>();
    const declared = new Map(src.blocks.map((b) => [b.name, b.waits]));
    const api: ExtensionApi = Object.freeze({
      define(name: string, fn: (...args: never[]) => unknown) {
        if (!declared.has(name)) throw new Error(`'${name}' isn't a block in this manifest`);
        if (typeof fn !== 'function') throw new Error(`'${name}' needs a function`);
        fns.set(name, fn as (...args: unknown[]) => unknown);
      },
      log: (text: unknown) => deps.log(src.id, String(text)),
      http: (method: 'GET' | 'POST', url: string, body?: string) =>
        deps.net.request({
          method: method === 'POST' ? 'POST' : 'GET',
          url: String(url),
          ...(body !== undefined ? { body: String(body) } : {}),
        }),
    });
    let failed: string | undefined;
    try {
      (new Function('stitch', `"use strict";\n${src.code}`) as (api: ExtensionApi) => void)(api);
    } catch (e) {
      failed = e instanceof Error ? e.message : String(e);
      errors.push({ id: src.id, message: failed });
    }
    for (const { name, waits } of src.blocks) {
      const fn = fns.get(name);
      if (!fn && !failed) errors.push({ id: src.id, message: `no implementation for '${name}'` });
      const why = failed ?? `no implementation for '${name}'`;
      impls[name] = fn
        ? wrap(src.id, name, waits, fn)
        : () => {
            throw new Error(`extension '${src.id}': ${why}`);
          };
    }
  }
  return { impls, errors };
}

function wrap(id: string, name: string, waits: boolean, fn: (...args: unknown[]) => unknown): Impl {
  const call = (S: Sprite, args: Value[]) => {
    try {
      return fn(...args.map(copy), context(S));
    } catch (e) {
      throw new Error(`extension '${id}': ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  if (waits)
    return function* (S: Sprite, ...args: Value[]) {
      const r = call(S, args);
      return toValue(isThenable(r) ? yield* settle(r) : r);
    };
  return (S: Sprite, ...args: Value[]) => {
    const r = call(S, args);
    if (isThenable(r))
      throw new Error(`extension '${id}': '${name}' returned a Promise; mark it "waits": true`);
    return toValue(r);
  };
}

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  typeof (v as { then?: unknown } | null)?.then === 'function';

/** Lists are shared by reference in Stitch; extensions get copies so they can't corrupt state. */
const copy = (v: Value): Value => (Array.isArray(v) ? v.map(copy) : v);

/** Whatever an extension returns, as a Stitch value. */
export function toValue(v: unknown): Value {
  if (typeof v === 'number') return Number.isNaN(v) ? 0 : v;
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map(toValue);
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function context(S: Sprite): ExtensionContext {
  return Object.freeze({
    sprite: Object.freeze({
      name: S.name,
      x: S.x,
      y: S.y,
      direction: S.direction,
      size: S.size,
      visible: S.visible,
      costume: S.costume + 1,
    }),
  });
}

import type { NodeId } from './nodes';

export interface IdGen {
  next(): NodeId;
}

export function createIdGen(prefix = 'n'): IdGen {
  let i = 0;
  return { next: () => `${prefix}${++i}` };
}

const STRIP = new Set(['id']);

/** Deep copy without `id` fields, for structural comparison. */
export function stripIds<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (k, v: unknown) => (STRIP.has(k) ? undefined : v))) as T;
}

/** Structural equality ignoring node ids and `undefined` fields. */
export function irEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(stripIds(a))) === JSON.stringify(canonical(stripIds(b)));
}

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) out[k] = canonical((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

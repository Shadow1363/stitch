/**
 * Scratch lets variables, lists, custom blocks and their inputs have any name. Stitch names are
 * identifiers, so each one is spelled as an identifier and given a suffix when that spelling is
 * taken or reserved.
 */
import { BUILTINS, SPRITE_PROPS } from '@stitch/ir';

/** Grammar keywords, including contextual ones, so imported names never read ambiguously. */
const KEYWORDS = [
  'and',
  'backdrop',
  'break',
  'click',
  'clone',
  'continue',
  'do',
  'else',
  'elseif',
  'end',
  'false',
  'for',
  'forever',
  'function',
  'global',
  'if',
  'in',
  'key',
  'local',
  'loudness',
  'message',
  'not',
  'on',
  'or',
  'repeat',
  'return',
  'shared',
  'start',
  'then',
  'timer',
  'true',
  'until',
  'var',
  'wait',
  'warp',
  'while',
];

const RESERVED = new Set([...KEYWORDS, ...Object.keys(SPRITE_PROPS), ...BUILTINS.keys()]);

/** `my score!` → `my_score`. Letters lose their accents; anything else becomes `_`. */
export function identifier(raw: string): string {
  const s = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return /^\d/.test(s) ? `_${s}` : s;
}

/** Names taken in one scope. A child scope also avoids every name its parents hold. */
export class Namespace {
  private readonly taken = new Set<string>();
  constructor(private readonly parent?: Namespace) {}

  has(name: string): boolean {
    return this.taken.has(name) || (this.parent?.has(name) ?? false);
  }

  /** Claims an identifier for `raw`, or for `fallback` when nothing of `raw` survives. */
  claim(raw: string, fallback: string): string {
    const base = identifier(raw) || fallback;
    let name = base;
    for (let i = 2; RESERVED.has(name) || this.has(name); i++) name = `${base}_${i}`;
    this.taken.add(name);
    return name;
  }
}

/** `base`, or `base2`, `base3`… when taken, as Scratch numbers duplicate names. */
export function uniqueLabel(base: string, taken: Set<string>): string {
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base}${i}`;
  taken.add(name);
  return name;
}

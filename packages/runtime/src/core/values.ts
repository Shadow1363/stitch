/** Runtime values. Lists are mutable and shared by reference. */
export type Value = number | string | boolean | Value[];

const isBlank = (s: string) => s.trim() === '';

/** Scratch-style number coercion: anything unparseable is 0. */
export function n(v: unknown): number {
  if (typeof v === 'number') return v === v ? v : 0;
  return toNumSlow(v);
}

function toNumSlow(v: unknown): number {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    if (isBlank(v)) return 0;
    const x = Number(v);
    return x === x ? x : 0;
  }
  return 0;
}

/** True when a value reads as a number (used by == and comparisons). */
function numeric(v: unknown): v is number | string {
  if (typeof v === 'number') return v === v;
  if (typeof v === 'string') return !isBlank(v) && !Number.isNaN(Number(v));
  return false;
}

export function s(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return numberToString(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(s).join(' ');
  return '';
}

function numberToString(v: number): string {
  if (Object.is(v, -0)) return '0';
  return String(v);
}

/** Truthiness: false, 0, "", "0", "false" are false (Scratch rules). */
export function b(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0 && v === v;
  if (typeof v === 'string') return v !== '' && v !== '0' && v.toLowerCase() !== 'false';
  return Array.isArray(v);
}

/** `==`: numeric when both sides read as numbers, otherwise exact (case-sensitive) text. */
export function eq(a: unknown, c: unknown): boolean {
  if (typeof a === 'number' && typeof c === 'number') return a === c;
  if (numeric(a) && numeric(c)) return Number(a) === Number(c);
  if (typeof a === 'boolean' && typeof c === 'boolean') return a === c;
  return s(a) === s(c);
}

/** Three-way compare used by <, <=, >, >=. */
export function cmp(a: unknown, c: unknown): number {
  if (numeric(a) && numeric(c)) {
    const x = Number(a);
    const y = Number(c);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  const x = s(a);
  const y = s(c);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Floored modulo: the result has the sign of the divisor. */
export function mod(a: unknown, c: unknown): number {
  const x = n(a);
  const y = n(c);
  const r = x % y;
  return r !== 0 && r < 0 !== y < 0 ? r + y : r;
}

/** 1-based read; out of range gives "". */
export function index(target: unknown, i: unknown): Value {
  const k = Math.floor(n(i)) - 1;
  if (Array.isArray(target)) return k >= 0 && k < target.length ? (target[k] as Value) : '';
  const str = s(target);
  return k >= 0 && k < str.length ? str[k]! : '';
}

/** 1-based write; out of range does nothing (Scratch "replace item"). */
export function setIndex(target: unknown, i: unknown, v: Value): void {
  if (!Array.isArray(target)) return;
  const k = Math.floor(n(i)) - 1;
  if (k >= 0 && k < target.length) target[k] = v;
}

export function len(v: unknown): number {
  return Array.isArray(v) ? v.length : s(v).length;
}

export function push(list: unknown, v: Value): void {
  if (Array.isArray(list)) list.push(v);
}

export function insert(list: unknown, i: unknown, v: Value): void {
  if (!Array.isArray(list)) return;
  const k = Math.floor(n(i)) - 1;
  if (k >= 0 && k <= list.length) list.splice(k, 0, v);
}

export function remove(list: unknown, i: unknown): void {
  if (!Array.isArray(list)) return;
  const k = Math.floor(n(i)) - 1;
  if (k >= 0 && k < list.length) list.splice(k, 1);
}

export function contains(v: unknown, item: unknown): boolean {
  if (Array.isArray(v)) return v.some((x) => eq(x, item));
  return s(v).includes(s(item));
}

/** Snapshot for `for x in v`: lists are copied, strings iterate characters. */
export function iter(v: unknown): Value[] {
  if (Array.isArray(v)) return v.slice();
  return Array.from(s(v));
}

const RAD = Math.PI / 180;
/** Rounded to 10 places so sin(180) is exactly 0, as in Scratch. */
const trig = (f: (x: number) => number) => (deg: unknown) =>
  Math.round(f(n(deg) * RAD) * 1e10) / 1e10;

export const sin = trig(Math.sin);
export const cos = trig(Math.cos);
export function tan(deg: unknown): number {
  const d = ((n(deg) % 360) + 360) % 360;
  if (d === 90) return Infinity;
  if (d === 270) return -Infinity;
  return Math.round(Math.tan(d * RAD) * 1e10) / 1e10;
}

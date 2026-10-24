import type { ParamRef } from './builtins';

/**
 * Names in a cart that string arguments refer to. Validation warns about unknown ones and the
 * editor completes them; the editor fills this from the session (the IR knows only code).
 */
export interface CartNames {
  sprites: readonly string[];
  /** Costume names by sprite name. */
  costumes: Readonly<Record<string, readonly string[]>>;
  sounds: readonly string[];
  songs: readonly string[];
}

/** Words a parameter accepts besides cart names: special targets, effects, styles and keys. */
export const REF_WORDS: Record<ParamRef, readonly string[]> = {
  sprite: ['mouse', 'random', 'myself', 'edge', 'stage'],
  costume: [],
  sound: [],
  song: [],
  message: [],
  key: [
    'space',
    'left',
    'right',
    'up',
    'down',
    'enter',
    'escape',
    'any',
    ...'abcdefghijklmnopqrstuvwxyz0123456789',
  ],
  effect: ['ghost', 'brightness', 'color'],
  rotation: ['all around', 'left-right', "don't rotate"],
};

/**
 * Edit distance where swapping two neighbouring letters counts as one edit (optimal string
 * alignment), so typos like "mvoe" are one step from "move". Stops early once it passes `max`.
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let before: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        v = Math.min(v, before[j - 2]! + 1);
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    before = prev;
    prev = cur;
  }
  return prev[b.length]!;
}

/**
 * Candidates close enough to `name` to be what was meant, closest first: case differences, or
 * up to a third of the name's letters (at least one) changed.
 */
export function didYouMean(name: string, candidates: Iterable<string>, limit = 3): string[] {
  const max = Math.max(1, Math.floor(name.length / 3));
  const scored: { c: string; d: number }[] = [];
  for (const c of new Set(candidates)) {
    if (c === name) continue;
    const d = c.toLowerCase() === name.toLowerCase() ? 0 : editDistance(name, c, max);
    if (d <= max) scored.push({ c, d });
  }
  return scored
    .sort((x, y) => x.d - y.d || x.c.localeCompare(y.c))
    .slice(0, limit)
    .map((s) => s.c);
}

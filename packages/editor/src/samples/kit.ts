/**
 * Helpers for samples built from source (Patch Hop, Needle Storm): pixel art written as text,
 * tilesets, sound effects from presets and tracker songs in a compact notation. The art and
 * music are data here, and each game's code is in its own `.stitch` files.
 */
import {
  blankImage,
  encodeLayers,
  sfxPreset,
  type Cell,
  type Instrument,
  type Music,
  type Pattern,
  type PixelAsset,
  type Sound,
  type SfxParams,
  type SfxPreset,
} from '@stitch/cart';

/** One letter per pixel, in PICO-8 palette order; `.` is clear. Values are palette index + 1. */
export const INK: Record<string, number> = {
  k: 1, // black
  n: 2, // navy
  p: 3, // plum
  g: 4, // dark green
  b: 5, // brown
  d: 6, // dark grey
  l: 7, // light grey
  w: 8, // white
  r: 9, // red
  o: 10, // orange
  y: 11, // yellow
  G: 12, // green
  B: 13, // blue
  i: 14, // lavender
  P: 15, // pink
  f: 16, // peach
};

/** Pixel values for rows of letters. */
function paint(rows: readonly string[], px: Uint8Array, width: number, ox = 0) {
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const v = INK[ch];
      if (v === undefined) throw new Error(`unknown pixel letter "${ch}"`);
      px[y * width + ox + x] = v;
    }),
  );
}

/** A costume from rows of letters, centred unless `center` is given. */
export function art(name: string, rows: readonly string[], center?: [number, number]): PixelAsset {
  const width = rows[0]!.length;
  const height = rows.length;
  if (rows.some((r) => r.length !== width)) throw new Error(`${name}: rows differ in width`);
  const img = blankImage(width, height);
  paint(rows, img.layers[0]!.pixels, width);
  return {
    kind: 'pixel',
    name,
    center: center ?? [Math.floor(width / 2), Math.floor(height / 2)],
    width,
    height,
    layers: encodeLayers(img),
  };
}

/** A one-row tileset: tile 1 is the first picture, tile 2 the next, and so on. */
export function tileset(
  name: string,
  size: number,
  tiles: readonly (readonly string[])[],
): PixelAsset {
  const width = size * tiles.length;
  const img = blankImage(width, size);
  tiles.forEach((t, i) => {
    if (t.length !== size || t.some((r) => r.length !== size))
      throw new Error(`${name}: tile ${i + 1} isn't ${size}×${size}`);
    paint(t, img.layers[0]!.pixels, width, i * size);
  });
  return { kind: 'pixel', name, center: [0, 0], width, height: size, layers: encodeLayers(img) };
}

/** A sound effect from an sfxr preset, with any parameters changed. */
export function sound(
  name: string,
  preset: SfxPreset,
  seed: number,
  change: Partial<SfxParams> = {},
): Sound {
  return { kind: 'sfx', name, params: { ...sfxPreset(preset, seed), ...change } };
}

const NOTES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * One channel of a pattern, a token per row: a note like `C4`, `F#3` or `Bb2`, `.` to hold
 * (nothing new) and `-` for note off. Tokens are separated by spaces, and `|` is ignored, so
 * bars can be marked.
 */
function channel(notes: string, inst: string, vol: number): (Cell | null)[] {
  return notes
    .split(/\s+/)
    .filter((t) => t && t !== '|')
    .map((t): Cell | null => {
      if (t === '.') return null;
      if (t === '-') return { note: -1 };
      const m = /^([A-G])([#b]?)(-?\d)$/.exec(t);
      if (!m) throw new Error(`bad note "${t}"`);
      const shift = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
      return { note: 12 * (Number(m[3]) + 1) + NOTES[m[1]!]! + shift, inst, vol };
    });
}

/** A pattern from one note string per channel (each the same number of rows). */
export function pattern(
  name: string,
  channels: readonly { inst: string; vol: number; notes: string }[],
): Pattern {
  const cols = channels.map((c) => channel(c.notes, c.inst, c.vol));
  const rows = cols[0]!.length;
  for (const c of cols)
    if (c.length !== rows) throw new Error(`${name}: channels differ in length`);
  return { name, rows, cells: Array.from({ length: rows }, (_, r) => cols.map((c) => c[r]!)) };
}

/** A song of patterns played in order and looped, at `bpm`. */
export function music(
  song: string,
  bpm: number,
  instruments: Record<string, Instrument>,
  patterns: Record<string, Pattern>,
  order: string[],
): Music {
  const channels = Math.max(...Object.values(patterns).map((p) => p.cells[0]!.length));
  return {
    channels,
    instruments,
    patterns,
    songs: { song: { name: song, bpm, order, loop: true } },
  };
}

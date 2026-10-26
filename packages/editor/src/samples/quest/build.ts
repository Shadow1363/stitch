/**
 * Thimble Quest, a top-down adventure sample (Cart → Samples, or `?sample=quest`). Built from
 * source when opened: the code is the `.stitch` files beside this one, and the art, sounds and
 * music are below. The world is a 3×3 grid of stage-sized rooms in one tile map, scrolled with
 * `scroll_map`. The map starts as the world text in stage.stitch, so the cart shows it before
 * it runs.
 */
import { DEFAULT_PALETTE, encodeTiles, normalizeStage, type SpriteInit } from '@stitch/cart';
import { art, music, pattern, sound, tileset } from '../kit';
import heartCode from './heart.stitch?raw';
import heroCode from './hero.stitch?raw';
import lintCode from './lint.stitch?raw';
import needleCode from './needle.stitch?raw';
import stageCode from './stage.stitch?raw';
import thimbleCode from './thimble.stitch?raw';

/** The stage is one room: 24 × 16 cells of 8 pixels. */
export const ROOM = { width: 192, height: 128 };

const TILES = tileset('tiles', 8, [
  // 1 a tuft of grass
  ['........', '........', '..g.....', '.g.g....', '........', '.....g..', '....g.g.', '........'],
  // 2 sand
  ['ffffffff', 'ffofffff', 'ffffffof', 'ffffffff', 'foffffff', 'ffffffff', 'fffffoff', 'ffffffff'],
  // 3 a tree
  ['..gggg..', '.gGGggg.', 'gGGgggGg', 'gGggggGg', 'ggggGggg', '.gggggg.', '...bb...', '..bbbb..'],
  // 4 a rock
  ['.dddddd.', 'dllllldd', 'dlwlllld', 'dllllldd', 'dlllldld', 'ddlllldd', 'dddddddd', '.dddddd.'],
  // 5 water
  ['BBBBBBBB', 'BwwBBBBB', 'BBBBBBBB', 'BBBBBwwB', 'BBBBBBBB', 'BBwwBBBB', 'BBBBBBBB', 'nBBBBBBn'],
  // 6 flowers
  ['........', '.r......', 'rwr..y..', '.r..ywy.', '.....y..', '..w.....', '.wyw....', '..w.....'],
]);

const ASSETS = {
  tiles: TILES,
  down1: art('down1', [
    '..oooo..',
    '.oooooo.',
    '.fkffkf.',
    '.ffffff.',
    '.BBBBBB.',
    'fBBBBBBf',
    '.BBBBBB.',
    '.k....k.',
  ]),
  down2: art('down2', [
    '..oooo..',
    '.oooooo.',
    '.fkffkf.',
    '.ffffff.',
    'fBBBBBB.',
    '.BBBBBBf',
    '.BBBBBB.',
    '..k..k..',
  ]),
  up1: art('up1', [
    '..oooo..',
    '.oooooo.',
    '.oooooo.',
    '.foooof.',
    '.BBBBBB.',
    'fBBBBBBf',
    '.BBBBBB.',
    '.k....k.',
  ]),
  up2: art('up2', [
    '..oooo..',
    '.oooooo.',
    '.oooooo.',
    '.foooof.',
    '.BBBBBBf',
    'fBBBBBB.',
    '.BBBBBB.',
    '..k..k..',
  ]),
  side1: art('side1', [
    '..oooo..',
    '.ooooo..',
    '.oofkf..',
    '.offfff.',
    '..BBBB..',
    '.fBBBB..',
    '..BBBB..',
    '..k..k..',
  ]),
  side2: art('side2', [
    '..oooo..',
    '.ooooo..',
    '.oofkf..',
    '.offfff.',
    '..BBBB..',
    '..BBBBf.',
    '..BBBB..',
    '.k....k.',
  ]),
  needle: art('needle', ['d.......', 'dlllllww', 'd.......']),
  lint1: art('lint1', [
    '..i..i..',
    '.iiiiii.',
    'iiwkiwki',
    'iiiiiiii',
    'iipiipii',
    '.iiiiii.',
    '..i..i..',
    '........',
  ]),
  lint2: art('lint2', [
    '........',
    '.i.ii.i.',
    'iiiiiiii',
    'iiwkiwki',
    'iiiiiiii',
    'iipiipii',
    '.iiiiii.',
    'i.i..i.i',
  ]),
  heart: art('heart', ['.rr.rr.', 'rwrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...']),
  thimble1: art('thimble1', [
    '..yyyy..',
    '.yoyoyy.',
    '.yyyyyy.',
    '.yoyoyy.',
    '.yyyyyy.',
    'yoyoyoyy',
    'yyyyyyyy',
    '.oooooo.',
  ]),
  thimble2: art('thimble2', [
    '..yyyy..',
    '.ywyoyy.',
    '.wyyyyy.',
    '.yoyoyy.',
    '.yyyyyy.',
    'yoyoyoyy',
    'yyyyyyyy',
    '.oooooo.',
  ]),
};

const SOUNDS = {
  swing: sound('swing', 'laser', 5, { volume: 0.25 }),
  hit: sound('hit', 'hit', 7, { volume: 0.45 }),
  poof: sound('poof', 'explosion', 12, { volume: 0.35 }),
  hurt: sound('hurt', 'hit', 21, { freq: 0.2, volume: 0.5 }),
  heal: sound('heal', 'coin', 4, { volume: 0.4 }),
  lose: sound('lose', 'explosion', 9, { volume: 0.5 }),
  win: sound('win', 'powerup', 17, { volume: 0.5 }),
};

const DRUMS =
  'C6 . C4 . C6 C6 C4 . | C6 . C4 . C6 C6 C4 . | C6 . C4 . C6 C6 C4 . | C6 . C4 . C6 . C4 C4';

const MUSIC = music(
  'quest',
  120,
  {
    lead: {
      name: 'Lead',
      wave: 'pulse',
      attack: 0.005,
      decay: 0.12,
      sustain: 0.55,
      release: 0.1,
      volume: 0.4,
    },
    bass: {
      name: 'Bass',
      wave: 'triangle',
      attack: 0.005,
      decay: 0.2,
      sustain: 0.8,
      release: 0.1,
      volume: 0.9,
    },
    drum: {
      name: 'Drum',
      wave: 'noise',
      attack: 0,
      decay: 0.05,
      sustain: 0,
      release: 0.02,
      volume: 0.3,
    },
  },
  {
    a: pattern('Out', [
      {
        inst: 'lead',
        vol: 46,
        notes: 'D5 . . A4 D5 . E5 F5 | G5 . . . F5 . E5 . | F5 . D5 . A4 . D5 . | E5 . . . . . - .',
      },
      {
        inst: 'bass',
        vol: 60,
        notes:
          'D3 . A2 . D3 . A2 . | Bb2 . F2 . Bb2 . F2 . | F2 . C3 . F2 . C3 . | A2 . E2 . A2 . E2 .',
      },
      { inst: 'drum', vol: 36, notes: DRUMS },
    ]),
    b: pattern('Onward', [
      {
        inst: 'lead',
        vol: 46,
        notes:
          'A5 . . G5 F5 . E5 . | F5 . . E5 D5 . C5 . | Bb4 . D5 . F5 . A5 . | G5 . . . E5 . - .',
      },
      {
        inst: 'bass',
        vol: 60,
        notes: 'D3 . . . D3 . . . | C3 . . . C3 . . . | Bb2 . . . Bb2 . . . | A2 . . . A2 . C#3 .',
      },
      { inst: 'drum', vol: 36, notes: DRUMS },
    ]),
  },
  ['a', 'a', 'b', 'a'],
);

/** The world's rows, from the `push` lines of `function world()` in stage.stitch. */
export function worldText(): string[] {
  const m = /function world\(\)([\s\S]*?)\nend/.exec(stageCode);
  if (!m) throw new Error('no world in stage.stitch');
  return [...m[1]!.matchAll(/push\(rows, "([^"]*)"\)/g)].map((x) => x[1]!);
}

/** The map cells for the world's text, as the game's `build_map` makes them. */
export function worldCells(rows: readonly string[]): Uint16Array {
  const width = rows[0]!.length;
  const cells = new Uint16Array(width * rows.length);
  const tiles: Record<string, number> = { ',': 1, ':': 2, T: 3, '#': 4, '~': 5, '*': 6, $: 6 };
  rows.forEach((row, r) => [...row].forEach((c, col) => (cells[r * width + col] = tiles[c] ?? 0)));
  return cells;
}

export const SOURCES = {
  stage: stageCode,
  hero: heroCode,
  needle: needleCode,
  lint: lintCode,
  heart: heartCode,
  thimble: thimbleCode,
};

/** The cart's parts and source text per file, ready for `Session.fromSources`. */
export function questCart() {
  const rows = worldText();
  const base = { direction: 90, size: 100, visible: false, costume: 1, x: 0, y: 0 };
  // Pip shows at the start before Run, though the map then shows the top-left room.
  const sprites: SpriteInit[] = [
    { ...base, id: 'thimble', name: 'Thimble', layer: 0, costumes: ['thimble1', 'thimble2'] },
    { ...base, id: 'heart', name: 'Heart', layer: 1, costumes: ['heart'] },
    { ...base, id: 'lint', name: 'Lint', layer: 2, costumes: ['lint1', 'lint2'] },
    { ...base, id: 'needle', name: 'Needle', layer: 3, costumes: ['needle'] },
    {
      ...base,
      id: 'hero',
      name: 'Hero',
      layer: 4,
      x: 100,
      y: 92,
      visible: true,
      costumes: ['down1', 'down2', 'up1', 'up2', 'side1', 'side2'],
    },
  ];
  const parts = {
    meta: { title: 'Thimble Quest', author: 'Stitch samples' },
    stage: normalizeStage({
      width: ROOM.width,
      height: ROOM.height,
      origin: 'top-left',
      yAxis: 'down',
      scaling: { mode: 'fit', filter: 'pixel' },
      background: '#00e436',
    }),
    sprites,
    palette: DEFAULT_PALETTE.slice(),
    assets: ASSETS,
    map: {
      tileset: 'tiles',
      tileSize: 8,
      width: rows[0]!.length,
      height: rows.length,
      tiles: encodeTiles(worldCells(rows)),
    },
    sounds: SOUNDS,
    music: MUSIC,
  };
  return { parts, sources: SOURCES };
}

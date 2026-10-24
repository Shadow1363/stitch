/**
 * Patch Hop, a platformer sample (Cart → Samples, or `?sample=platformer`). Built from source
 * when opened: the code is the `.stitch` files beside this one, and the art, sounds and music
 * are below. The tile map starts as level 1, read from the level text in stage.stitch, so the
 * cart shows the level before it runs.
 */
import { DEFAULT_PALETTE, encodeTiles, normalizeStage, type SpriteInit } from '@stitch/cart';
import { art, music, pattern, sound, tileset } from '../kit';
import buttonCode from './button.stitch?raw';
import playerCode from './player.stitch?raw';
import snipCode from './snip.stitch?raw';
import stageCode from './stage.stitch?raw';

const TILES = tileset('tiles', 8, [
  // 1 grass
  ['GGGGGGGG', 'GGgGGGgG', 'gbgbbgbg', 'bbbbbbbb', 'bbobbbbb', 'bbbbbbob', 'bobbbbbb', 'bbbbbbbb'],
  // 2 earth
  ['bbbbbbbb', 'bbbbobbb', 'bobbbbbb', 'bbbbbbbb', 'bbbbbbob', 'bbobbbbb', 'bbbbbbbb', 'bbbbbobb'],
  // 3 a quilted ledge
  ['PPPPPPPP', 'PwPPPwPP', 'PPPPPPPP', 'pppppppp', 'PPPPPPPP', 'PPPwPPPw', 'PPPPPPPP', 'pppppppp'],
  // 4 pins
  ['........', '..r...r.', '..l...l.', '..l...l.', '..l...l.', '.lll.lll', 'llllllll', 'dddddddd'],
  // 5 the flag
  ['.dyyyy..', '.dyyyyy.', '.dyyyyy.', '.dyyyy..', '.d......', '.d......', '.d......', '.d......'],
  // 6 its pole
  ['.d......', '.d......', '.d......', '.d......', '.d......', '.d......', '.d......', 'ddd.....'],
]);

const ASSETS = {
  tiles: TILES,
  stand: art('stand', [
    '..oooo..',
    '.offffo.',
    '.ffkfkf.',
    '.ffffff.',
    '..BBBB..',
    '.fBBBBf.',
    '..BBBB..',
    '..b..b..',
  ]),
  run: art('run', [
    '..oooo..',
    '.offffo.',
    '.ffkfkf.',
    '.ffffff.',
    '..BBBB..',
    'fBBBBB..',
    '..BBBBf.',
    '.b....b.',
  ]),
  jump: art('jump', [
    'f.oooo.f',
    'foffffof',
    '.ffkfkf.',
    '.ffffff.',
    '..BBBB..',
    '..BBBB..',
    '.b....b.',
    '........',
  ]),
  open: art('open', [
    'l......l',
    '.l....l.',
    '..l..l..',
    '...dd...',
    '..r..r..',
    '.r.rr.r.',
    '.r.rr.r.',
    '..r..r..',
  ]),
  shut: art('shut', [
    '...ll...',
    '...ll...',
    '...ll...',
    '...dd...',
    '..r..r..',
    '.r.rr.r.',
    '.r.rr.r.',
    '..r..r..',
  ]),
  button: art('button', ['.oooo.', 'oybybo', 'oyyyyo', 'oybybo', '.oooo.']),
};

const SOUNDS = {
  jump: sound('jump', 'jump', 11, { volume: 0.35 }),
  button: sound('button', 'coin', 4, { volume: 0.4 }),
  stomp: sound('stomp', 'hit', 7, { volume: 0.5 }),
  hurt: sound('hurt', 'hit', 21, { freq: 0.2, volume: 0.5 }),
  flag: sound('flag', 'powerup', 3, { volume: 0.45 }),
  lose: sound('lose', 'explosion', 9, { volume: 0.5 }),
  win: sound('win', 'powerup', 17, { volume: 0.5 }),
};

const MUSIC = music(
  'hop',
  132,
  {
    lead: {
      name: 'Lead',
      wave: 'pulse',
      attack: 0.005,
      decay: 0.1,
      sustain: 0.5,
      release: 0.08,
      volume: 0.45,
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
      decay: 0.06,
      sustain: 0,
      release: 0.02,
      volume: 0.35,
    },
  },
  {
    a: pattern('Verse', [
      {
        inst: 'lead',
        vol: 48,
        notes:
          'C5 . E5 . G5 . E5 . | F5 . A5 . G5 . E5 . | D5 . F5 . E5 . C5 . | D5 . . . G4 . - .',
      },
      {
        inst: 'bass',
        vol: 60,
        notes: 'C3 . . . C3 . . . | F2 . . . F2 . . . | G2 . . . G2 . . . | G2 . . . B2 . . .',
      },
      {
        inst: 'drum',
        vol: 40,
        notes: 'C6 . . . C4 . . . | C6 . . . C4 . . . | C6 . . . C4 . . . | C6 . C6 . C4 . . .',
      },
    ]),
    b: pattern('Chorus', [
      {
        inst: 'lead',
        vol: 48,
        notes:
          'E5 . G5 . C6 . G5 . | A5 . F5 . A5 . C6 . | B5 . G5 . D5 . F5 . | E5 . . . C5 . - .',
      },
      {
        inst: 'bass',
        vol: 60,
        notes: 'A2 . . . A2 . . . | F2 . . . F2 . . . | G2 . . . G2 . . . | C3 . . . C3 . . .',
      },
      {
        inst: 'drum',
        vol: 40,
        notes: 'C6 . . . C4 . . . | C6 . . . C4 . . . | C6 . . . C4 . . . | C6 . C6 . C4 . C4 .',
      },
    ]),
  },
  ['a', 'a', 'b', 'a'],
);

/** The map cells for a level's text, as the game's `build_map` makes them. */
export function levelCells(rows: readonly string[]): Uint16Array {
  const cells = new Uint16Array(32 * 20);
  rows.forEach((row, r) =>
    [...row].forEach((c, col) => {
      let t = { '#': 1, '=': 3, '^': 4, F: 5, '|': 6 }[c] ?? 0;
      if (t === 1 && rows[r - 1]?.[col] === '#') t = 2;
      cells[r * 32 + col] = t;
    }),
  );
  return cells;
}

/** The rows of level `n`, from the `push` lines of `function level<n>()` in stage.stitch. */
export function levelText(n: number): string[] {
  const m = new RegExp(`function level${n}\\(\\)([\\s\\S]*?)\\nend`).exec(stageCode);
  if (!m) throw new Error(`no level ${n} in stage.stitch`);
  return [...m[1]!.matchAll(/push\(rows, "([^"]*)"\)/g)].map((x) => x[1]!);
}

export const SOURCES = { stage: stageCode, player: playerCode, snip: snipCode, button: buttonCode };

/** The cart's parts and source text per file, ready for `Session.fromSources`. */
export function platformerCart() {
  const base = { direction: 90, size: 100, visible: false, costume: 1 };
  const sprites: SpriteInit[] = [
    { ...base, id: 'button', name: 'Button', x: 0, y: 0, layer: 0, costumes: ['button'] },
    { ...base, id: 'snip', name: 'Snip', x: 0, y: 0, layer: 1, costumes: ['open', 'shut'] },
    {
      ...base,
      id: 'player',
      name: 'Player',
      x: 12,
      y: 124,
      layer: 2,
      visible: true,
      costumes: ['stand', 'run', 'jump'],
    },
  ];
  const parts = {
    meta: { title: 'Patch Hop', author: 'Stitch samples' },
    stage: normalizeStage({
      width: 256,
      height: 160,
      origin: 'top-left',
      yAxis: 'down',
      scaling: { mode: 'fit', filter: 'pixel' },
      background: '#87ceeb',
    }),
    sprites,
    palette: DEFAULT_PALETTE.slice(),
    assets: ASSETS,
    map: {
      tileset: 'tiles',
      tileSize: 8,
      width: 32,
      height: 20,
      tiles: encodeTiles(levelCells(levelText(1))),
    },
    sounds: SOUNDS,
    music: MUSIC,
  };
  return { parts, sources: SOURCES };
}

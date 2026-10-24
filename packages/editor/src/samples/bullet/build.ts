/**
 * Needle Storm, a bullet hell sample (Cart → Samples, or `?sample=bullet`): one boss, The Spool,
 * in three phases. Built from source when opened: the code is the `.stitch` files beside this
 * one, and the art, sounds and music are below.
 */
import { DEFAULT_PALETTE, normalizeStage, type SpriteInit } from '@stitch/cart';
import { art, music, pattern, sound } from '../kit';
import bossCode from './boss.stitch?raw';
import bulletCode from './bullet.stitch?raw';
import playerCode from './player.stitch?raw';
import shotCode from './shot.stitch?raw';
import stageCode from './stage.stitch?raw';
import starCode from './star.stitch?raw';

const ASSETS = {
  calm: art('calm', [
    '...bbbbbbbbbbbbbbbbbbbbbbbbbb...',
    '..boooooooooooooooooooooooooob..',
    '..bbbbbbbbbbbbbbbbbbbbbbbbbbbb..',
    '....rrrrrrrrrrrrrrrrrrrrrrrr....',
    '....rrrrrrrrrrrrrrrrrrrrrrrr....',
    '....pppppppppppppppppppppppp....',
    '....rrrrrrrrrrrrrrrrrrrrrrrr....',
    '....rrrrrrrrrrrrrrrrrrrrrrrr....',
    '....ppppppwwwppppppwwwpppppp....',
    '....rrrrrwwwwwrrrrwwwwwrrrrr....',
    '....rrrrrwwkkwrrrrwwkkwrrrrr....',
    '....pppppwwkkwppppwwkkwppppp....',
    '....rrrrrrwwwrrrrrrwwwrrrrrr....',
    '....rrrrrrrrrrrrrrrrrrrrrrrr....',
    '....pppppppppppppppppppppppp....',
    '....rrrrrrrrrkkkkkkrrrrrrrrr....',
    '....rrrrrrrrrrrrrrrrrrrrrrrr....',
    '....pppppppppppppppppppppppp....',
    '....rrrrrrrrrrrrrrrrrrrrrrrr....',
    '..bbbbbbbbbbbbbbbbbbbbbbbbbbbb..',
    '..boooooooooooooooooooooooooob..',
    '...bbbbbbbbbbbbbbbbbbbbbbbbbb...',
    '................................',
  ]),
  angry: art('angry', [
    '...bbbbbbbbbbbbbbbbbbbbbbbbbb...',
    '..boooooooooooooooooooooooooob..',
    '..bbbbbbbbbbbbbbbbbbbbbbbbbbbb..',
    '....rrrrrrrrrrrrrrrrrrrrrrrr....',
    '....rrrrrrrrrrrrrrrrrrrrrrrr....',
    '....pppppppppppppppppppppppp....',
    '....rrrrrkkkrrrrrrrrkkkrrrrr....',
    '....rrrrrrrrkkrrrrkkrrrrrrrr....',
    '....ppppppwwwppppppwwwpppppp....',
    '....rrrrrwwwwwrrrrwwwwwrrrrr....',
    '....rrrrrwwkkwrrrrwwkkwrrrrr....',
    '....pppppwwkkwppppwwkkwppppp....',
    '....rrrrrrwwwrrrrrrwwwrrrrrr....',
    '....rrrrrrrrrrrrrrrrrrrrrrrr....',
    '....pppppppppppppppppppppppp....',
    '....rrrrrrrrkkkkkkkkrrrrrrrr....',
    '....rrrrrrrkrrrrrrrrkrrrrrrr....',
    '....pppppppppppppppppppppppp....',
    '....rrrrrrrrrrrrrrrrrrrrrrrr....',
    '..bbbbbbbbbbbbbbbbbbbbbbbbbbbb..',
    '..boooooooooooooooooooooooooob..',
    '...bbbbbbbbbbbbbbbbbbbbbbbbbb...',
    '................................',
  ]),
  // The thimble, and the same with its hit dot ringed (slow, precise flying).
  ship: art('ship', [
    '....l....',
    '...lll...',
    '..llwll..',
    '..lwlwl..',
    '.llwrwll.',
    '.lllllll.',
    'lllllllll',
    'ldldldldl',
    '.d.....d.',
  ]),
  focus: art('focus', [
    '....l....',
    '...lll...',
    '..llwll..',
    '..lwwwl..',
    '.llwrwll.',
    '.llwwwll.',
    'lllllllll',
    'ldldldldl',
    '.d.....d.',
  ]),
  shot: art('shot', ['.y.', 'ywy', 'ywy', '.w.', '.w.', '.y.']),
  // Bullet kinds, by costume number: round, needle (drawn pointing right, turned to its heading),
  // petal, big round.
  round: art('round', ['.PPP.', 'PwwwP', 'PwwwP', 'PwwwP', '.PPP.']),
  needle: art('needle', ['l.....', 'lwwwww', 'l.....'], [3, 1]),
  petal: art('petal', ['.oo..', 'oyyo.', 'oyyyo', '.oyyo', '..oo.']),
  big: art('big', ['..BBB..', '.BwwwB.', 'BwwwwwB', 'BwwwwwB', 'BwwwwwB', '.BwwwB.', '..BBB..']),
  star: art('star', ['l']),
  bright: art('bright', ['w']),
};

const SOUNDS = {
  shot: sound('shot', 'laser', 5, { volume: 0.12 }),
  ouch: sound('ouch', 'hit', 3, { volume: 0.5 }),
  phase: sound('phase', 'powerup', 8, { volume: 0.5 }),
  boom: sound('boom', 'explosion', 2, { volume: 0.6 }),
  win: sound('win', 'powerup', 23, { volume: 0.5 }),
};

const MUSIC = music(
  'storm',
  150,
  {
    lead: {
      name: 'Lead',
      wave: 'square',
      attack: 0.005,
      decay: 0.1,
      sustain: 0.5,
      release: 0.08,
      volume: 0.35,
    },
    bass: {
      name: 'Bass',
      wave: 'saw',
      attack: 0.005,
      decay: 0.15,
      sustain: 0.7,
      release: 0.05,
      volume: 0.45,
    },
    drum: {
      name: 'Drum',
      wave: 'noise',
      attack: 0,
      decay: 0.05,
      sustain: 0,
      release: 0.02,
      volume: 0.35,
    },
  },
  {
    a: pattern('Drive', [
      {
        inst: 'lead',
        vol: 44,
        notes:
          'A4 . C5 . E5 . A5 . | G5 . E5 . C5 . E5 . | F5 . D5 . A4 . D5 . | E5 . . . G#4 . . .',
      },
      {
        inst: 'bass',
        vol: 56,
        notes:
          'A2 A2 . A2 A2 . A2 . | C3 C3 . C3 C3 . C3 . | D3 D3 . D3 D3 . D3 . | E3 E3 . E3 E3 . E3 .',
      },
      {
        inst: 'drum',
        vol: 40,
        notes:
          'C6 . C3 . C6 . C3 . | C6 . C3 . C6 . C3 C3 | C6 . C3 . C6 . C3 . | C6 . C3 . C6 C6 C3 .',
      },
    ]),
    b: pattern('Climb', [
      {
        inst: 'lead',
        vol: 44,
        notes: 'C6 . B5 . A5 . E5 . | F5 . G5 . A5 . . . | B5 . A5 . G#5 . E5 . | A5 . . . - . . .',
      },
      {
        inst: 'bass',
        vol: 56,
        notes:
          'F2 F2 . F2 F2 . F2 . | G2 G2 . G2 G2 . G2 . | E2 E2 . E2 E2 . E2 . | A2 A2 . A2 A2 . A2 .',
      },
      {
        inst: 'drum',
        vol: 40,
        notes:
          'C6 . C3 . C6 . C3 . | C6 . C3 . C6 . C3 C3 | C6 . C3 . C6 . C3 . | C6 C6 C3 C3 C6 C6 C3 C3',
      },
    ]),
  },
  ['a', 'a', 'b', 'a'],
);

export const SOURCES = {
  stage: stageCode,
  star: starCode,
  boss: bossCode,
  shot: shotCode,
  player: playerCode,
  bullet: bulletCode,
};

/** The cart's parts and source text per file, ready for `Session.fromSources`. */
export function bulletCart() {
  const base = { x: 96, y: 128, direction: 90, size: 100, visible: false, costume: 1 };
  const sprites: SpriteInit[] = [
    { ...base, id: 'star', name: 'Star', layer: 0, costumes: ['star', 'bright'] },
    {
      ...base,
      id: 'boss',
      name: 'Boss',
      y: 56,
      layer: 1,
      visible: true,
      costumes: ['calm', 'angry'],
    },
    { ...base, id: 'shot', name: 'Shot', layer: 2, costumes: ['shot'] },
    {
      ...base,
      id: 'player',
      name: 'Player',
      y: 220,
      layer: 3,
      visible: true,
      costumes: ['ship', 'focus'],
    },
    {
      ...base,
      id: 'bullet',
      name: 'Bullet',
      layer: 4,
      costumes: ['round', 'needle', 'petal', 'big'],
    },
  ];
  const parts = {
    meta: { title: 'Needle Storm', author: 'Stitch samples' },
    stage: normalizeStage({
      width: 192,
      height: 256,
      origin: 'top-left',
      yAxis: 'down',
      scaling: { mode: 'fit', filter: 'pixel' },
      background: '#0b0f2a',
      // Bullets are clones; the busiest phase has a few hundred on screen.
      cloneLimit: 1000,
    }),
    sprites,
    palette: DEFAULT_PALETTE.slice(),
    assets: ASSETS,
    map: undefined,
    sounds: SOUNDS,
    music: MUSIC,
  };
  return { parts, sources: SOURCES };
}

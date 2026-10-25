/**
 * Scratch Parity (Cart → Samples, or `?sample=parity`): a self-check that Stitch's blocks behave
 * like Scratch 3's, then a live demo of backdrops, distortion effects, sound effects, drag mode,
 * the pen's colour controls and the clock. The code is the `.stitch` files beside this one; the
 * Checker prints PASS or FAIL per check, and `parity.test.ts` runs it and wants no FAIL.
 */
import {
  blankImage,
  DEFAULT_PALETTE,
  encodeLayers,
  normalizeStage,
  type PixelAsset,
  type SpriteInit,
} from '@stitch/cart';
import { art, INK, sound } from '../kit';
import catCode from './cat.stitch?raw';
import checkerCode from './checker.stitch?raw';
import painterCode from './painter.stitch?raw';
import stageCode from './stage.stitch?raw';

const W = 192;
const H = 144;

/** A stage-sized backdrop: sky, a band of ground, and a few dots (stars, flowers). */
function backdrop(name: string, sky: string, ground: string, dot: string): PixelAsset {
  const img = blankImage(W, H);
  const px = img.layers[0]!.pixels;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) px[y * W + x] = INK[y < H - 28 ? sky : ground]!;
  for (let i = 0; i < 24; i++) {
    // Deterministic scatter, so the art is the same on every build.
    const x = (i * 53 + 7) % W;
    const y = (i * 29 + 11) % (H - 34);
    px[y * W + x] = INK[dot]!;
  }
  return {
    kind: 'pixel',
    name,
    width: W,
    height: H,
    center: [W / 2, H / 2],
    layers: encodeLayers(img),
  };
}

const ASSETS = {
  day: backdrop('day', 'B', 'G', 'w'),
  night: backdrop('night', 'n', 'g', 'y'),
  dusk: backdrop('dusk', 'p', 'b', 'o'),
  cat: art('cat', [
    'o..............o',
    'oo............oo',
    'ooo..........ooo',
    'oooooooooooooooo',
    'oooooooooooooooo',
    'oowwkooooooowwko',
    'oowwkooooooowwko',
    'oooooooooooooooo',
    'oooooooPPooooooo',
    'ooooookkkkoooooo',
    'oooooooooooooooo',
    '.oooooooooooooo.',
    '..oooooooooooo..',
    '..oo..oooo..oo..',
    '..oo..oooo..oo..',
    '..kk..kkkk..kk..',
  ]),
  target: art('target', [
    '..rrrrrr..',
    '.rrwwwwrr.',
    'rrwrrrrwrr',
    'rwrrwwrrwr',
    'rwrwrrwrwr',
    'rwrwrrwrwr',
    'rwrrwwrrwr',
    'rrwrrrrwrr',
    '.rrwwwwrr.',
    '..rrrrrr..',
  ]),
  dot: art('dot', ['ww', 'ww']),
};

const SOUNDS = { blip: sound('blip', 'blip', 4, { volume: 0.5 }) };

export const SOURCES = {
  stage: stageCode,
  checker: checkerCode,
  target: targetCode(),
  cat: catCode,
  painter: painterCode,
};

/** The target only sits still, so its file just says what it's for. */
function targetCode(): string {
  return '-- The Checker glides the cat here and reads its position.\n';
}

/** The cart's parts and source text per file, ready for `Session.fromSources`. */
export function parityCart() {
  const base = { x: 0, y: 0, direction: 90, size: 100, visible: true, costume: 1 };
  const sprites: SpriteInit[] = [
    { ...base, id: 'checker', name: 'Checker', layer: 0, visible: false, costumes: ['dot'] },
    { ...base, id: 'target', name: 'Target', x: 60, y: -30, layer: 1, costumes: ['target'] },
    { ...base, id: 'cat', name: 'Cat', layer: 2, costumes: ['cat'] },
    { ...base, id: 'painter', name: 'Painter', layer: 3, visible: false, costumes: ['dot'] },
  ];
  const parts = {
    meta: { title: 'Scratch Parity', author: 'Stitch samples' },
    stage: normalizeStage({
      width: W,
      height: H,
      scaling: { mode: 'fit', filter: 'pixel' },
      background: '#1d2b53',
    }),
    sprites,
    backdrops: ['day', 'night', 'dusk'],
    backdrop: 1,
    palette: DEFAULT_PALETTE.slice(),
    assets: ASSETS,
    map: undefined,
    sounds: SOUNDS,
  };
  return { parts, sources: SOURCES };
}

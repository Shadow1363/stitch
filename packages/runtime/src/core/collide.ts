import { pose, stageBounds, type Rect } from './bounds';
import { distortion, transformPoint } from './effects';
import type { Space } from './space';
import type { CostumeInfo, Sprite } from './sprite';
import type { MapState } from './world';

/**
 * Pixel-level sensing in stage pixels: touching, colours under a sprite and the sprite at a
 * point. Everything here reads costume pixels on the CPU, never the GPU, so results are the
 * same on every renderer and in Node. Without decoded pixels a costume counts as a solid box.
 */

/** Maps a stage pixel into a sprite's costume, or undefined when it falls outside it. */
function costumePixel(s: Sprite, c: CostumeInfo, space: Space, px: number, py: number) {
  const p = space.toStagePx(s.x, s.y);
  const k = s.size / 100;
  if (k === 0) return undefined;
  const { rotation, flip } = pose(s, space);
  const dx = px - p.x;
  const dy = py - p.y;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  let u = (dx * cos + dy * sin) / k;
  const v = (-dx * sin + dy * cos) / k;
  if (flip) u = -u;
  let fx = u + c.center[0];
  let fy = v + c.center[1];
  if (fx < 0 || fy < 0 || fx >= c.width || fy >= c.height) return undefined;
  const d = distortion(s.effects);
  if (d) {
    [fx, fy] = transformPoint(d, fx / c.width, fy / c.height, c.width, c.height);
    fx *= c.width;
    fy *= c.height;
    if (fx < 0 || fy < 0 || fx >= c.width || fy >= c.height) return undefined;
  }
  return Math.floor(fy) * c.width + Math.floor(fx);
}

/** RGBA at a stage pixel of a sprite, or undefined where the sprite is transparent. */
function spriteColor(s: Sprite, space: Space, px: number, py: number): number | undefined {
  const c = s.currentCostume;
  if (!c) return undefined;
  const i = costumePixel(s, c, space, px, py);
  if (i === undefined) return undefined;
  const d = c.pixels;
  if (!d) return 0xffffffff;
  if (d[i * 4 + 3]! === 0) return undefined;
  return ((d[i * 4]! << 16) | (d[i * 4 + 1]! << 8) | d[i * 4 + 2]!) >>> 0;
}

export function opaqueAt(s: Sprite, space: Space, px: number, py: number): boolean {
  return s.visible && spriteColor(s, space, px, py) !== undefined;
}

function overlap(a: Rect, b: Rect): Rect | undefined {
  const r = {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
  return r.left < r.right && r.top < r.bottom ? r : undefined;
}

/** Calls `f` with the centre of each stage pixel in `r` until it returns true. */
function anyPixel(r: Rect, f: (x: number, y: number) => boolean): boolean {
  for (let y = Math.floor(r.top); y < Math.ceil(r.bottom); y++)
    for (let x = Math.floor(r.left); x < Math.ceil(r.right); x++)
      if (f(x + 0.5, y + 0.5)) return true;
  return false;
}

/** Two visible sprites share an opaque pixel (boxes first, then pixels). */
export function spritesTouch(a: Sprite, b: Sprite, space: Space): boolean {
  if (a === b || !a.visible || !b.visible || !a.currentCostume || !b.currentCostume) return false;
  const r = overlap(stageBounds(a, space), stageBounds(b, space));
  if (!r) return false;
  return anyPixel(r, (x, y) => opaqueAt(a, space, x, y) && opaqueAt(b, space, x, y));
}

/** Topmost visible sprite with an opaque pixel at a stage point. `drawList` is back to front. */
export function spriteAt(
  drawList: readonly Sprite[],
  space: Space,
  px: number,
  py: number,
): Sprite | undefined {
  for (let i = drawList.length - 1; i >= 0; i--) {
    const s = drawList[i]!;
    if (opaqueAt(s, space, px, py)) return s;
  }
  return undefined;
}

/** Scratch matches colours on their top bits (5 for red and green, 4 for blue). */
export function sameColor(a: number, b: number): boolean {
  return (a & 0xf8f8f0) === (b & 0xf8f8f0);
}

export interface Backdrop {
  drawList: readonly Sprite[];
  map: MapState | undefined;
  tileset: CostumeInfo | undefined;
  /** Its costume is the backdrop, under the map. */
  stage?: Sprite;
  /** Stage background, 0xRRGGBB. */
  background: number;
}

/**
 * Colour seen under a stage point with `self` left out: the topmost other sprite, then the
 * tile map, then the stage background. The pen layer isn't included (D27).
 */
export function colorBelow(
  self: Sprite,
  bg: Backdrop,
  space: Space,
  px: number,
  py: number,
): number {
  for (let i = bg.drawList.length - 1; i >= 0; i--) {
    const s = bg.drawList[i]!;
    if (s === self || !s.visible) continue;
    const c = spriteColor(s, space, px, py);
    if (c !== undefined) return c;
  }
  const m = bg.map;
  const ts = bg.tileset;
  if (m && ts?.pixels) {
    // The map scrolls under the stage; everything below is in map pixels.
    px += m.scroll.x;
    py += m.scroll.y;
    const col = Math.floor(px / m.tileSize);
    const row = Math.floor(py / m.tileSize);
    if (col >= 0 && row >= 0 && col < m.width && row < m.height) {
      const t = m.cells[row * m.width + col]!;
      const cols = Math.floor(ts.width / m.tileSize);
      if (t > 0 && cols > 0) {
        const tx = ((t - 1) % cols) * m.tileSize + Math.floor(px - col * m.tileSize);
        const ty = Math.floor((t - 1) / cols) * m.tileSize + Math.floor(py - row * m.tileSize);
        const i = ty * ts.width + tx;
        const d = ts.pixels;
        if (ty < ts.height && d[i * 4 + 3]! > 0)
          return (d[i * 4]! << 16) | (d[i * 4 + 1]! << 8) | d[i * 4 + 2]!;
      }
    }
  }
  if (bg.stage) {
    const c = spriteColor(bg.stage, space, px, py);
    if (c !== undefined) return c;
  }
  return bg.background;
}

/**
 * Whether any of the sprite's opaque pixels (only those of colour `mine`, when given) lies over
 * colour `target`.
 */
export function touchesColor(
  s: Sprite,
  target: number,
  mine: number | undefined,
  bg: Backdrop,
  space: Space,
): boolean {
  if (!s.visible || !s.currentCostume) return false;
  const r = stageBounds(s, space);
  const clip = overlap(r, { left: 0, top: 0, right: space.width, bottom: space.height });
  if (!clip) return false;
  return anyPixel(clip, (x, y) => {
    const c = spriteColor(s, space, x, y);
    if (c === undefined || (mine !== undefined && !sameColor(c, mine))) return false;
    return sameColor(colorBelow(s, bg, space, x, y), target);
  });
}

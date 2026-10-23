import type { Space } from './space';
import type { Sprite } from './sprite';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Axis-aligned bounds of the rotated, scaled costume, in stage pixels (y down). */
export function stageBounds(sprite: Sprite, space: Space): Rect {
  const p = space.toStagePx(sprite.x, sprite.y);
  const c = sprite.currentCostume;
  if (!c) return { left: p.x, top: p.y, right: p.x, bottom: p.y };
  const k = sprite.size / 100;
  const rot = space.dirToRotation(sprite.direction);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const [cx, cy] = c.center;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const [u, v] of [
    [-cx, -cy],
    [c.width - cx, -cy],
    [-cx, c.height - cy],
    [c.width - cx, c.height - cy],
  ] as const) {
    const x = p.x + k * (u * cos - v * sin);
    const y = p.y + k * (u * sin + v * cos);
    if (x < left) left = x;
    if (x > right) right = x;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  return { left, top, right, bottom };
}

export type Edge = 'left' | 'right' | 'top' | 'bottom' | '';

/** Tolerance so a sprite clamped exactly onto an edge does not count as past it. */
const EPS = 1e-6;

/** The visual stage edge the sprite crosses most, or "". */
export function edgeCrossed(sprite: Sprite, space: Space): Edge {
  const r = stageBounds(sprite, space);
  const over: [Edge, number][] = [
    ['left', -r.left],
    ['right', r.right - space.width],
    ['top', -r.top],
    ['bottom', r.bottom - space.height],
  ];
  let best: Edge = '';
  let amount = EPS;
  for (const [edge, o] of over) {
    if (o > amount) {
      best = edge;
      amount = o;
    }
  }
  return best;
}

/** Moves the sprite the least distance that puts its bounds fully on stage. */
export function clampToStage(sprite: Sprite, space: Space): void {
  const r = stageBounds(sprite, space);
  const sx = shift(r.left, r.right, space.width);
  const sy = shift(r.top, r.bottom, space.height);
  if (sx === 0 && sy === 0) return;
  const d = space.stageDeltaToCart(sx, sy);
  sprite.x += d.dx;
  sprite.y += d.dy;
}

function shift(lo: number, hi: number, size: number): number {
  if (hi - lo > size) return size / 2 - (lo + hi) / 2;
  if (lo < 0) return -lo;
  if (hi > size) return size - hi;
  return 0;
}

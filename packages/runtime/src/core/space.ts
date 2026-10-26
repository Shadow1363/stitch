import type { StageSettings } from '@stitch/cart';

/**
 * The only module that knows how cart coordinates map to the screen.
 *
 * Cart space: whatever the cart's StageSettings say (Scratch default: centre origin, y up).
 * Stage pixels: unscaled, origin top-left, y down — what Pixi draws in before viewport scaling.
 * Directions are always visual: 0 = screen-up, 90 = screen-right, clockwise, in (-180, 180].
 */
export interface Space {
  readonly settings: StageSettings;
  readonly width: number;
  readonly height: number;
  toStagePx(x: number, y: number): { x: number; y: number };
  fromStagePx(px: number, py: number): { x: number; y: number };
  /** Map pixel (x right, y down from the map's top-left) under a cart point, with the map scrolled. */
  toMapPx(x: number, y: number, scroll: { x: number; y: number }): { x: number; y: number };
  /** Cart-space delta for moving `dist` steps in visual direction `dir`. */
  forward(dir: number, dist: number): { dx: number; dy: number };
  /** Cart-space delta for a stage-pixel delta. */
  stageDeltaToCart(sx: number, sy: number): { dx: number; dy: number };
  /** Visual direction of a cart-space delta. */
  directionOf(dx: number, dy: number): number;
  /** Pixi rotation (radians, clockwise) for a visual direction; costumes face right at 90. */
  dirToRotation(dir: number): number;
  /** Uniform scale and offset that place the stage inside a viewport. */
  fit(viewW: number, viewH: number): { scale: number; offX: number; offY: number };
}

const RAD = Math.PI / 180;

export function createSpace(settings: StageSettings): Space {
  const { width: w, height: h } = settings;
  const ox = settings.origin === 'center' ? w / 2 : 0;
  const oy = settings.origin === 'center' ? h / 2 : 0;
  const up = settings.yAxis === 'up';
  return {
    settings,
    width: w,
    height: h,
    toStagePx: (x, y) => ({ x: ox + x, y: up ? oy - y : oy + y }),
    fromStagePx: (px, py) => ({ x: px - ox, y: up ? oy - py : py - oy }),
    toMapPx: (x, y, scroll) => ({ x: ox + x + scroll.x, y: (up ? oy - y : oy + y) + scroll.y }),
    forward(dir, dist) {
      const sx = dist * Math.sin(dir * RAD);
      const sy = -dist * Math.cos(dir * RAD);
      return { dx: sx, dy: up ? -sy : sy };
    },
    stageDeltaToCart: (sx, sy) => ({ dx: sx, dy: up ? -sy : sy }),
    directionOf(dx, dy) {
      const sy = up ? -dy : dy;
      return normalizeDirection(Math.atan2(dx, -sy) / RAD);
    },
    dirToRotation: (dir) => (dir - 90) * RAD,
    fit(viewW, viewH) {
      let scale = Math.min(viewW / w, viewH / h);
      if (settings.scaling.mode === 'integer' && scale >= 1) scale = Math.floor(scale);
      return { scale, offX: (viewW - w * scale) / 2, offY: (viewH - h * scale) / 2 };
    },
  };
}

/** Wraps any angle into (-180, 180], like Scratch. */
export function normalizeDirection(d: number): number {
  if (!Number.isFinite(d)) return 90;
  let r = ((d % 360) + 360) % 360;
  if (r > 180) r -= 360;
  return r === -180 ? 180 : r;
}

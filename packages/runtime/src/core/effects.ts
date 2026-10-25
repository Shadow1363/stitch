import type { Effects } from './sprite';

/**
 * The distortion effects (fisheye, whirl, pixelate, mosaic) as Scratch's renderer computes them
 * (scratch-render's ShaderManager uniforms and EffectTransform). The Pixi filters draw the same
 * maths on the GPU; `transformPoint` runs it on the CPU so pixel touching sees what's drawn.
 */
export interface Distortion {
  /** Exponent; 1 is no change. */
  fisheye: number;
  /** Radians at the centre; 0 is no change. */
  whirl: number;
  /** Cell size in costume pixels; 0 is off. */
  pixelate: number;
  /** Copies per side, 1–512; 1 is off. */
  mosaic: number;
}

/** The uniforms for a sprite's effects, or undefined when none distorts it. */
export function distortion(e: Effects): Distortion | undefined {
  if (!e.fisheye && !e.whirl && !e.pixelate && !e.mosaic) return undefined;
  return {
    fisheye: e.fisheye ? Math.max(0, (e.fisheye + 100) / 100) : 1,
    whirl: (-e.whirl * Math.PI) / 180,
    pixelate: Math.abs(e.pixelate) / 10,
    mosaic: e.mosaic ? Math.max(1, Math.min(512, Math.round((Math.abs(e.mosaic) + 10) / 10))) : 1,
  };
}

/**
 * The costume as drawn with `d`: each pixel sampled through `transformPoint` (nearest), so
 * renderers show exactly what pixel touching sees. RGBA in, RGBA out, same size.
 */
export function distortPixels(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  d: Distortion,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [u, v] = transformPoint(d, (x + 0.5) / w, (y + 0.5) / h, w, h);
      const sx = Math.floor(u * w);
      const sy = Math.floor(v * h);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const i = (sy * w + sx) * 4;
      out.set(src.subarray(i, i + 4), (y * w + x) * 4);
    }
  return out;
}

/** A key that changes whenever the drawn result would. */
export const distortionKey = (d: Distortion): string =>
  `${d.fisheye},${d.whirl},${d.pixelate},${d.mosaic}`;

/**
 * Where a drawn point samples the costume: (u, v) in 0–1 texture space, through mosaic,
 * pixelate, whirl then fisheye (the shader's order). `w`/`h` are the costume size in pixels.
 */
export function transformPoint(
  d: Distortion,
  u: number,
  v: number,
  w: number,
  h: number,
): [number, number] {
  if (d.mosaic !== 1) {
    u = (d.mosaic * u) % 1;
    v = (d.mosaic * v) % 1;
  }
  if (d.pixelate) {
    const tx = w / d.pixelate;
    const ty = h / d.pixelate;
    u = (Math.floor(u * tx) + 0.5) / tx;
    v = (Math.floor(v * ty) + 0.5) / ty;
  }
  if (d.whirl) {
    const ox = u - 0.5;
    const oy = v - 0.5;
    const f = Math.max(1 - Math.hypot(ox, oy) / 0.5, 0);
    const a = d.whirl * f * f;
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    u = cos * ox + sin * oy + 0.5;
    v = -sin * ox + cos * oy + 0.5;
  }
  if (d.fisheye !== 1) {
    const vx = (u - 0.5) / 0.5;
    const vy = (v - 0.5) / 0.5;
    const len = Math.hypot(vx, vy);
    if (len > 0) {
      const r = Math.min(len, 1) ** d.fisheye * Math.max(1, len);
      u = 0.5 + (r / len) * vx * 0.5;
      v = 0.5 + (r / len) * vy * 0.5;
    }
  }
  return [u, v];
}

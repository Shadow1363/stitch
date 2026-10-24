import { DEFAULT_PALETTE, parseHex } from '@stitch/cart';
import type { Space } from './space';
import type { PenState, RotationStyle, Sprite } from './sprite';
import * as $ from './values';
import type { Value } from './values';

/** Colour as 0xRRGGBB, alpha 0–1. */
interface Ink {
  color: number;
  alpha: number;
}

/** What a stamp needs to draw a sprite as it looked at that moment. */
export interface StampPose {
  x: number;
  y: number;
  direction: number;
  size: number;
  rotationStyle: RotationStyle;
}

/**
 * One drawing step for the pen layer, in stage pixels (origin top-left, y down). The renderer
 * draws them in order into a texture under the sprites; they are never read back.
 */
export type PenOp =
  | { kind: 'clear' }
  | ({ kind: 'line'; x1: number; y1: number; x2: number; y2: number; width: number } & Ink)
  | ({ kind: 'rect'; x: number; y: number; w: number; h: number; line: number } & Ink)
  | ({ kind: 'circle'; x: number; y: number; r: number; line: number } & Ink)
  | {
      kind: 'stamp';
      costume: string;
      center: [number, number];
      pose: StampPose;
      alpha: number;
    };

/** Ops kept for a renderer that hasn't drawn yet. Past this, the oldest half is dropped. */
const MAX_OPS = 50_000;

/** The pen layer's pending drawing, built from cart coordinates through `Space` (rule 8). */
export class Pen {
  private ops: PenOp[] = [];

  constructor(private space: Space) {}

  /** Ops since the last call, for the renderer to draw. */
  take(): PenOp[] {
    const ops = this.ops;
    this.ops = [];
    return ops;
  }

  /** Pending ops, without taking them (tests). */
  get pending(): readonly PenOp[] {
    return this.ops;
  }

  private push(op: PenOp) {
    if (op.kind === 'clear') this.ops.length = 0;
    else if (this.ops.length >= MAX_OPS) this.ops.splice(0, MAX_OPS / 2);
    this.ops.push(op);
  }

  clear(): void {
    this.push({ kind: 'clear' });
  }

  line(p: PenState, x1: number, y1: number, x2: number, y2: number): void {
    const a = this.space.toStagePx(x1, y1);
    const b = this.space.toStagePx(x2, y2);
    this.push({ kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: p.size, ...ink(p) });
  }

  /** A rectangle between two corners, so it reads the same with either y axis. */
  rect(p: PenState, x1: number, y1: number, x2: number, y2: number, fill: boolean): void {
    const a = this.space.toStagePx(x1, y1);
    const b = this.space.toStagePx(x2, y2);
    this.push({
      kind: 'rect',
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
      line: fill ? 0 : p.size,
      ...ink(p),
    });
  }

  circle(p: PenState, x: number, y: number, r: number, fill: boolean): void {
    const c = this.space.toStagePx(x, y);
    this.push({
      kind: 'circle',
      x: c.x,
      y: c.y,
      r: Math.abs(r),
      line: fill ? 0 : p.size,
      ...ink(p),
    });
  }

  /** A round dot the size of the pen, as `pen down` leaves in Scratch. */
  dot(p: PenState, x: number, y: number): void {
    const c = this.space.toStagePx(x, y);
    this.push({ kind: 'circle', x: c.x, y: c.y, r: p.size / 2, line: 0, ...ink(p) });
  }

  stamp(s: Sprite): void {
    const c = s.currentCostume;
    if (!c || !s.visible) return;
    const pose = {
      x: s.x,
      y: s.y,
      direction: s.direction,
      size: s.size,
      rotationStyle: s.rotationStyle,
    };
    const alpha = 1 - s.effects.ghost / 100;
    this.push({ kind: 'stamp', costume: c.id, center: c.center, pose, alpha });
  }

  /**
   * Text in the built-in pixel font, top-left at (x, y). Each font pixel is `pen size` stage
   * pixels, and runs of lit pixels in a row become one rectangle.
   */
  text(p: PenState, text: string, x: number, y: number): void {
    const o = this.space.toStagePx(x, y);
    const k = Math.max(1, Math.round(p.size));
    const i = ink(p);
    let cx = 0;
    let cy = 0;
    for (const ch of text.toUpperCase()) {
      if (ch === '\n') {
        cx = 0;
        cy += LINE_HEIGHT;
        continue;
      }
      const rows = glyph(ch);
      for (let r = 0; r < 5; r++) {
        const bits = rows[r]!;
        let c = 0;
        while (c < 3) {
          if (!(bits & (4 >> c))) {
            c++;
            continue;
          }
          let end = c;
          while (end < 3 && bits & (4 >> end)) end++;
          this.push({
            kind: 'rect',
            x: o.x + (cx + c) * k,
            y: o.y + (cy + r) * k,
            w: (end - c) * k,
            h: k,
            line: 0,
            ...i,
          });
          c = end;
        }
      }
      cx += ADVANCE;
    }
  }
}

/** Font cell: 3×5 glyphs, 4 pixels apart, lines 6 pixels apart. */
export const ADVANCE = 4;
export const LINE_HEIGHT = 6;

/**
 * Stitch's own 3×5 pixel font. Each glyph is five rows top to bottom, one octal digit per row
 * (4 = left pixel, 2 = middle, 1 = right). Letters are capitals; text is upper-cased first.
 */
const FONT: Record<string, string> = {
  A: '25755',
  B: '65656',
  C: '34443',
  D: '65556',
  E: '74647',
  F: '74644',
  G: '34553',
  H: '55755',
  I: '72227',
  J: '11152',
  K: '55655',
  L: '44447',
  M: '57755',
  N: '65555',
  O: '25552',
  P: '65644',
  Q: '25563',
  R: '65655',
  S: '34216',
  T: '72222',
  U: '55557',
  V: '55552',
  W: '55775',
  X: '55255',
  Y: '55222',
  Z: '71247',
  '0': '75557',
  '1': '26227',
  '2': '61247',
  '3': '61216',
  '4': '55711',
  '5': '74616',
  '6': '34757',
  '7': '71222',
  '8': '75757',
  '9': '75716',
  ' ': '00000',
  '.': '00002',
  ',': '00024',
  '!': '22202',
  '?': '61202',
  ':': '02020',
  ';': '02024',
  '-': '00700',
  '+': '02720',
  '/': '11244',
  '(': '24442',
  ')': '21112',
  "'": '22000',
  '"': '55000',
  '=': '07070',
  '%': '51245',
  '#': '57575',
  '<': '12421',
  '>': '42124',
  '*': '05250',
  _: '00007',
  '[': '64446',
  ']': '31113',
  '♥': '05772',
};

const GLYPHS = new Map(
  Object.entries(FONT).map(([ch, rows]) => [ch, [...rows].map((d) => Number(d))]),
);

/** Rows of a character; anything the font lacks draws as `?`. */
export function glyph(ch: string): number[] {
  return GLYPHS.get(ch) ?? GLYPHS.get('?')!;
}

function ink(p: PenState): Ink {
  return { color: hsvToRgb(p.hue, p.saturation, p.brightness), alpha: 1 - p.transparency / 100 };
}

/** Scratch-scale HSV (each 0–100) to 0xRRGGBB. */
export function hsvToRgb(h: number, s: number, v: number): number {
  const hh = ((((h % 100) + 100) % 100) / 100) * 6;
  const ss = clamp01(s / 100);
  const vv = clamp01(v / 100);
  const i = Math.floor(hh);
  const f = hh - i;
  const p = vv * (1 - ss);
  const q = vv * (1 - ss * f);
  const t = vv * (1 - ss * (1 - f));
  const [r, g, b] = [
    [vv, t, p],
    [q, vv, p],
    [p, vv, t],
    [p, q, vv],
    [t, p, vv],
    [vv, p, q],
  ][i % 6]!;
  return (Math.round(r! * 255) << 16) | (Math.round(g! * 255) << 8) | Math.round(b! * 255);
}

/** 0–255 RGB to Scratch-scale HSV (each 0–100). */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [(h / 6) * 100, max ? (d / max) * 100 : 0, (max / 255) * 100];
}

/**
 * A colour written in a script, as 0–255 RGB: `"#rrggbb"`/`"#rgb"`, or a palette number 1–16.
 * Undefined when it's neither.
 */
export function parseColor(c: Value): [number, number, number] | undefined {
  if (typeof c === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim()))
    return parseHex(c.trim());
  const n = $.n(c);
  const hex = Number.isInteger(n) ? DEFAULT_PALETTE[n - 1] : undefined;
  return hex ? parseHex(hex) : undefined;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

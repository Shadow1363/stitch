import { normalizeDirection } from './space';
import type { Value } from './values';

export interface CostumeInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Rotation centre in costume pixels from the top-left. */
  center: [number, number];
  pixelArt: boolean;
  /**
   * RGBA, row by row, for pixel-accurate touching. Optional: without it, touching uses the
   * costume's box. The stage decodes it lazily from the costume image.
   */
  readonly pixels?: Uint8ClampedArray | undefined;
}

export type RotationStyle = 'all around' | 'left-right' | "don't rotate";

/**
 * Graphic effects, on Scratch's scales: ghost 0–100, brightness -100–100, colour wraps at 200.
 * Fisheye, whirl, pixelate and mosaic distort the costume (see `core/effects.ts`).
 */
export interface Effects {
  ghost: number;
  brightness: number;
  color: number;
  fisheye: number;
  whirl: number;
  pixelate: number;
  mosaic: number;
}

export const NO_EFFECTS: Readonly<Effects> = {
  ghost: 0,
  brightness: 0,
  color: 0,
  fisheye: 0,
  whirl: 0,
  pixelate: 0,
  mosaic: 0,
};

/** Sound effects, on Scratch's scales: pitch ±360 (10 a semitone), pan -100 (left) to 100. */
export interface SoundEffects {
  pitch: number;
  pan: number;
}

/** Pen settings on Scratch's 0–100 scales (hue, saturation, brightness, transparency). */
export interface PenState {
  down: boolean;
  hue: number;
  saturation: number;
  brightness: number;
  transparency: number;
  size: number;
}

/** Called when a sprite with its pen down moves, with the old and new cart positions. */
export type PenMoved = (s: Sprite, x0: number, y0: number, x1: number, y1: number) => void;

/** Live sprite state. Positions are cart-space floats and are never rounded here. */
export class Sprite {
  size = 100;
  visible = true;
  layer = 0;
  /** 0-based index into `costumes`. */
  costume = 0;
  sayText: string | null = null;
  /** The bubble is a thought rather than speech. */
  thinking = false;
  rotationStyle: RotationStyle = 'all around';
  effects: Effects = { ...NO_EFFECTS };
  soundEffects: SoundEffects = { pitch: 0, pan: 0 };
  /** Set by `set_drag_mode`: the mouse can drag the sprite around the stage. */
  draggable = false;
  pen: PenState = {
    down: false,
    hue: 66.66,
    saturation: 100,
    brightness: 100,
    transparency: 0,
    size: 1,
  };
  /** Set while the pen is down, so moves draw. */
  penMoved: PenMoved | undefined;
  readonly vars: Record<string, Value> = Object.create(null) as Record<string, Value>;
  /** The original sprite: itself, or the one this clone was made from. */
  readonly original: Sprite;
  /** 0 for an original; clones count up from 1 per run. */
  readonly cloneNumber: number;
  /** Set once a clone is deleted, so stale references (e.g. a held id) are ignored. */
  deleted = false;
  private px = 0;
  private py = 0;
  private dir = 90;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly costumes: CostumeInfo[],
    /** The stage pseudo-sprite runs scripts but is never drawn. */
    readonly isStage = false,
    clone?: { of: Sprite; number: number },
  ) {
    this.original = clone ? clone.of.original : this;
    this.cloneNumber = clone?.number ?? 0;
  }

  get x(): number {
    return this.px;
  }

  set x(v: number) {
    if (this.penMoved) this.penMoved(this, this.px, this.py, v, this.py);
    this.px = v;
  }

  get y(): number {
    return this.py;
  }

  set y(v: number) {
    if (this.penMoved) this.penMoved(this, this.px, this.py, this.px, v);
    this.py = v;
  }

  /** Moves to (x, y) in one step, so a pen draws one segment rather than two. */
  moveTo(x: number, y: number): void {
    if (this.penMoved) this.penMoved(this, this.px, this.py, x, y);
    this.px = x;
    this.py = y;
  }

  get direction(): number {
    return this.dir;
  }

  set direction(d: number) {
    this.dir = normalizeDirection(d);
  }

  get costume_number(): number {
    return this.costume + 1;
  }

  get currentCostume(): CostumeInfo | undefined {
    return this.costumes[this.costume];
  }

  get isClone(): boolean {
    return this.cloneNumber > 0;
  }

  /** What scripts see as this sprite's id: its name, or "Name#k" for a clone. */
  get handle(): string {
    return this.cloneNumber ? `${this.name}#${this.cloneNumber}` : this.name;
  }
}

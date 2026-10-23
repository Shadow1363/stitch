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
}

/** Live sprite state. Positions are cart-space floats and are never rounded here. */
export class Sprite {
  x = 0;
  y = 0;
  size = 100;
  visible = true;
  layer = 0;
  /** 0-based index into `costumes`. */
  costume = 0;
  sayText: string | null = null;
  readonly vars: Record<string, Value> = Object.create(null) as Record<string, Value>;
  private dir = 90;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly costumes: CostumeInfo[],
    /** The stage pseudo-sprite runs scripts but is never drawn. */
    readonly isStage = false,
  ) {}

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
}

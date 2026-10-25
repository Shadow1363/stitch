/**
 * The parts of Scratch 3's `project.json` the importer reads. Shapes follow what Scratch saves;
 * every field is treated as possibly missing, since projects come from many tools.
 */

/** `[kind, value, shadow?]`: 1 shadow only, 2 block only, 3 a block covering a shadow. */
export type Sb3Input = [number, unknown, unknown?];

export interface Sb3Block {
  opcode: string;
  next?: string | null;
  parent?: string | null;
  inputs?: Record<string, Sb3Input>;
  /** `[value, id?]`; the id is set for variables, lists and broadcasts. */
  fields?: Record<string, [unknown, (string | null)?]>;
  shadow?: boolean;
  topLevel?: boolean;
  x?: number;
  y?: number;
  mutation?: Record<string, unknown>;
}

/**
 * A primitive saved in compact form: `[4..8, number]`, `[9, colour]`, `[10, text]`,
 * `[11, broadcast name, id]`, `[12, variable name, id]`, `[13, list name, id]`. Top-level ones
 * also carry x and y.
 */
export type Sb3Primitive = [number, ...unknown[]];

export interface Sb3Costume {
  name: string;
  assetId?: string;
  md5ext?: string;
  dataFormat: string;
  bitmapResolution?: number;
  rotationCenterX?: number;
  rotationCenterY?: number;
}

export interface Sb3Sound {
  name: string;
  assetId?: string;
  md5ext?: string;
  dataFormat: string;
}

export interface Sb3Comment {
  blockId?: string | null;
  text: string;
  x?: number;
  y?: number;
}

export interface Sb3Target {
  isStage: boolean;
  name: string;
  /** id → `[name, value, isCloud?]` */
  variables?: Record<string, [string, unknown, boolean?]>;
  /** id → `[name, items]` */
  lists?: Record<string, [string, unknown[]]>;
  blocks?: Record<string, Sb3Block | Sb3Primitive>;
  comments?: Record<string, Sb3Comment>;
  currentCostume?: number;
  costumes?: Sb3Costume[];
  sounds?: Sb3Sound[];
  layerOrder?: number;
  volume?: number;
  visible?: boolean;
  x?: number;
  y?: number;
  size?: number;
  direction?: number;
  draggable?: boolean;
  rotationStyle?: string;
}

export interface Sb3Monitor {
  id: string;
  opcode: string;
  params?: Record<string, string>;
  spriteName?: string | null;
  visible?: boolean;
}

export interface Sb3Project {
  targets: Sb3Target[];
  monitors?: Sb3Monitor[];
}

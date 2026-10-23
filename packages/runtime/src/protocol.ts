import type { SpriteInit, StageSettings } from '@stitch/cart';
import type { CostumeImage } from './pixi/textures';
import type { RendererPreference } from './pixi/stage';

/** Bump on any message shape change; both sides check it in load/ready. */
export const PROTOCOL_VERSION = 1;

export interface LoadPayload {
  /** Compiled program: body of `new Function('rt', code)`. */
  code: string;
  stage: StageSettings;
  sprites: SpriteInit[];
  /** Transferred; the sandbox never fetches assets itself. */
  costumes: CostumeImage[];
}

/** Editor -> stage. */
export type ToStage =
  | ({ t: 'load'; v: typeof PROTOCOL_VERSION } & LoadPayload)
  | { t: 'run' }
  | { t: 'stop' }
  | { t: 'ping'; n: number };

/** Stage -> editor. */
export type FromStage =
  | { t: 'ready'; v: typeof PROTOCOL_VERSION; renderer: string }
  | { t: 'loaded' }
  | { t: 'pong'; n: number }
  | {
      t: 'error';
      sprite: string;
      event: string;
      message: string;
      /** 1-based line in `code` */ line?: number;
    }
  | { t: 'log'; sprite: string; text: string }
  | { t: 'stats'; fps: number; tickMs: number; renderMs: number; threads: number };

export type { CostumeImage, RendererPreference };

export function transferablesOf(msg: ToStage): Transferable[] {
  return msg.t === 'load' ? msg.costumes.map((c) => c.bitmap) : [];
}

import type { SpriteInit, StageSettings } from '@stitch/cart';
import type { ExtensionSource } from './core/extensions';
import type { HttpRequest, HttpResponse } from './core/net';
import type { MapInit } from './core/world';
import type { CostumeImage } from './pixi/textures';
import type { RendererPreference } from './pixi/stage';

/** Bump on any message shape change; both sides check it in load/ready. */
export const PROTOCOL_VERSION = 4;

export interface LoadPayload {
  /** Compiled program: body of `new Function('rt', code)`. */
  code: string;
  stage: StageSettings;
  sprites: SpriteInit[];
  /** Transferred; the sandbox never fetches assets itself. Includes the map's tileset. */
  costumes: CostumeImage[];
  map?: MapInit;
  /** Rendered from cart sources by the editor; samples are transferred. In cart order. */
  sounds: PcmClip[];
  songs: PcmClip[];
  /** The cart's extensions, run inside the sandbox before the program. */
  extensions: ExtensionSource[];
}

/** Mono samples for one sound or song. */
export interface PcmClip {
  id: string;
  name: string;
  rate: number;
  samples: Float32Array;
  /** Songs only. */
  loop?: boolean;
}

/** Editor -> stage. */
export type ToStage =
  | ({ t: 'load'; v: typeof PROTOCOL_VERSION } & LoadPayload)
  | { t: 'run' }
  | { t: 'stop' }
  /** Freezes or continues the running program (simulation ticks and sound). */
  | { t: 'pause'; paused: boolean }
  | { t: 'ping'; n: number }
  /** The editor's answer to an `http` request. */
  | ({ t: 'http-result'; id: number } & HttpResponse);

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
  /** A script's HTTP request; the editor fetches it (adding secrets) and answers `http-result`. */
  | ({ t: 'http'; id: number } & HttpRequest)
  | {
      t: 'stats';
      fps: number;
      tickMs: number;
      renderMs: number;
      threads: number;
      /** False between a load and the next run, when 0 threads doesn't mean "finished". */
      started: boolean;
      /** AudioContext state: 'suspended' until a gesture unlocks it. */
      audio: string;
    };

export type { CostumeImage, ExtensionSource, HttpRequest, HttpResponse, RendererPreference };

export function transferablesOf(msg: ToStage): Transferable[] {
  if (msg.t !== 'load') return [];
  return [
    ...msg.costumes.map((c) => c.bitmap),
    ...[...msg.sounds, ...msg.songs].map((c) => c.samples.buffer as ArrayBuffer),
  ];
}

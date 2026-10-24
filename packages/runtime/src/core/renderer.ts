import type { PenOp } from './pen';
import type { Space } from './space';
import type { Sprite } from './sprite';
import type { MapState } from './world';

/**
 * Fill around the stage when the window's shape differs from the stage's. One dark value for
 * every theme, shared by the editor (`--letterbox`), `stage.html` and exported players.
 */
export const LETTERBOX = '#0d1017';

export interface RenderView {
  readonly space: Space;
  /** Drawable sprites, back to front. */
  readonly sprites: readonly Sprite[];
  readonly map?: MapState | undefined;
  /** Pen drawing since the last frame; a renderer takes it each frame. */
  readonly pen?: { take(): PenOp[] };
  /** `watch` monitors, label to value. */
  readonly watches?: ReadonlyMap<string, string>;
}

/** Draws world state. Called once per animation frame, after any ticks. */
export interface Renderer {
  render(view: RenderView): void;
  destroy?(): void;
}

export class NullRenderer implements Renderer {
  frames = 0;
  render(view: RenderView): void {
    view.pen?.take();
    this.frames++;
  }
}

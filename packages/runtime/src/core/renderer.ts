import type { Space } from './space';
import type { Sprite } from './sprite';

export interface RenderView {
  readonly space: Space;
  /** Drawable sprites, back to front. */
  readonly sprites: readonly Sprite[];
}

/** Draws world state. Called once per animation frame, after any ticks. */
export interface Renderer {
  render(view: RenderView): void;
  destroy?(): void;
}

export class NullRenderer implements Renderer {
  frames = 0;
  render(): void {
    this.frames++;
  }
}

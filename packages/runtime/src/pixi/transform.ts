import { pose, type Posed } from '../core/bounds';
import type { Space } from '../core/space';
import type { CostumeInfo } from '../core/sprite';

/** Where and how to draw one sprite, in stage pixels. Pure, so it is unit-tested without a GPU. */
export interface DisplayTransform {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  /** Mirrored left-right ("left-right" rotation style facing left). */
  flip: boolean;
  anchorX: number;
  anchorY: number;
}

export function displayTransform(
  sprite: Posed & { x: number; y: number; size: number },
  costume: CostumeInfo,
  space: Space,
  pixelSnap: boolean,
): DisplayTransform {
  const p = space.toStagePx(sprite.x, sprite.y);
  const scale = sprite.size / 100;
  const [cx, cy] = costume.center;
  let x = p.x;
  let y = p.y;
  if (pixelSnap) {
    // Snap the costume's top-left corner to whole stage pixels; positions stay floats in the world.
    x = Math.round(x - cx * scale) + cx * scale;
    y = Math.round(y - cy * scale) + cy * scale;
  }
  const { rotation, flip } = pose(sprite, space);
  return {
    x,
    y,
    rotation,
    scale,
    flip,
    anchorX: costume.width ? cx / costume.width : 0.5,
    anchorY: costume.height ? cy / costume.height : 0.5,
  };
}

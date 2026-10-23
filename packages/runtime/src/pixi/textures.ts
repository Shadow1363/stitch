import { Texture } from 'pixi.js';
import type { CostumeInfo } from '../core/sprite';

export interface CostumeImage {
  id: string;
  name: string;
  bitmap: ImageBitmap;
  pixelArt: boolean;
  center: [number, number];
}

/** Turns decoded costume images into Pixi textures plus the metadata the World needs. */
export function texturesFromCostumes(images: CostumeImage[], forcePixel: boolean) {
  const textures = new Map<string, Texture>();
  const costumes: Record<string, CostumeInfo> = {};
  for (const img of images) {
    const tex = Texture.from(img.bitmap);
    if (forcePixel || img.pixelArt) tex.source.scaleMode = 'nearest';
    textures.set(img.id, tex);
    costumes[img.id] = {
      id: img.id,
      name: img.name,
      width: img.bitmap.width,
      height: img.bitmap.height,
      center: img.center,
      pixelArt: img.pixelArt,
    };
  }
  return { textures, costumes };
}

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
    const info: CostumeInfo = {
      id: img.id,
      name: img.name,
      width: img.bitmap.width,
      height: img.bitmap.height,
      center: img.center,
      pixelArt: img.pixelArt,
    };
    // Decoded on first use by touching/colour sensing; most costumes never need it.
    let pixels: Uint8ClampedArray | undefined | null = null;
    Object.defineProperty(info, 'pixels', {
      get: () => (pixels === null ? (pixels = decode(img.bitmap)) : pixels),
      enumerable: true,
    });
    costumes[img.id] = info;
  }
  return { textures, costumes };
}

/** RGBA of a bitmap, or undefined where there's no canvas to read it with. */
function decode(bitmap: ImageBitmap): Uint8ClampedArray | undefined {
  if (typeof OffscreenCanvas === 'undefined' || !bitmap.width || !bitmap.height) return undefined;
  const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d', {
    willReadFrequently: true,
  });
  if (!ctx) return undefined;
  try {
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  } catch {
    return undefined; // a closed bitmap: fall back to the costume's box
  }
}

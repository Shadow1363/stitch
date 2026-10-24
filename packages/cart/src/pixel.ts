import { fromBase64, toBase64 } from './bytes';
import { MAX_COLORS, parseHex, toHex, TRANSPARENT } from './palette';

/**
 * Editable pixel art. Each layer is width*height palette indices (0 = transparent); layers
 * composite bottom to top. Pure functions here are shared by the editor and the runtime player.
 */
export interface PixelLayer {
  name: string;
  visible: boolean;
  /** Base64 of width*height bytes. */
  data: string;
}

/** Decoded, mutable form used while editing. */
export interface PixelImage {
  width: number;
  height: number;
  layers: { name: string; visible: boolean; pixels: Uint8Array }[];
}

export function blankImage(width: number, height: number): PixelImage {
  return {
    width,
    height,
    layers: [{ name: 'Layer 1', visible: true, pixels: new Uint8Array(width * height) }],
  };
}

export function decodeLayers(width: number, height: number, layers: PixelLayer[]): PixelImage {
  return {
    width,
    height,
    layers: layers.map((l) => {
      const raw = fromBase64(l.data);
      const pixels = new Uint8Array(width * height);
      pixels.set(raw.subarray(0, pixels.length));
      return { name: l.name, visible: l.visible, pixels };
    }),
  };
}

export function encodeLayers(img: PixelImage): PixelLayer[] {
  return img.layers.map((l) => ({ name: l.name, visible: l.visible, data: toBase64(l.pixels) }));
}

/**
 * The image on a canvas of a new size, anchored at the top-left: growing adds transparent
 * pixels, shrinking crops. Used to add and remove tiles in a tileset.
 */
export function resizeImage(img: PixelImage, width: number, height: number): PixelImage {
  return {
    width,
    height,
    layers: img.layers.map((l) => {
      const pixels = new Uint8Array(width * height);
      for (let y = 0; y < Math.min(height, img.height); y++)
        pixels.set(
          l.pixels.subarray(y * img.width, y * img.width + Math.min(width, img.width)),
          y * width,
        );
      return { ...l, pixels };
    }),
  };
}

export function cloneImage(img: PixelImage): PixelImage {
  return {
    width: img.width,
    height: img.height,
    layers: img.layers.map((l) => ({ ...l, pixels: l.pixels.slice() })),
  };
}

/** Visible layers flattened to RGBA (palette[i-1] for index i). */
export function composite(
  img: PixelImage,
  palette: readonly string[],
): Uint8ClampedArray<ArrayBuffer> {
  const rgb = palette.map(parseHex);
  const out = new Uint8ClampedArray(img.width * img.height * 4);
  for (const layer of img.layers) {
    if (!layer.visible) continue;
    const px = layer.pixels;
    for (let i = 0; i < px.length; i++) {
      const c = px[i]!;
      if (c === TRANSPARENT) continue;
      const col = rgb[c - 1];
      if (!col) continue;
      out[i * 4] = col[0];
      out[i * 4 + 1] = col[1];
      out[i * 4 + 2] = col[2];
      out[i * 4 + 3] = 255;
    }
  }
  return out;
}

export function getPixel(pixels: Uint8Array, width: number, x: number, y: number): number {
  return pixels[y * width + x] ?? TRANSPARENT;
}

/** Sets one pixel; out-of-bounds coordinates are ignored. Returns whether anything changed. */
export function setPixel(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  c: number,
): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const i = y * width + x;
  if (pixels[i] === c) return false;
  pixels[i] = c;
  return true;
}

/** Bresenham line, inclusive of both ends. */
export function drawLine(
  pixels: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: number,
): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    setPixel(pixels, width, height, x0, y0, c);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** 4-way flood fill of the region sharing the colour at (x, y). */
export function floodFill(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  c: number,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const target = pixels[y * width + x];
  if (target === c) return;
  const stack = [y * width + x];
  while (stack.length) {
    const i = stack.pop()!;
    if (pixels[i] !== target) continue;
    pixels[i] = c;
    const px = i % width;
    if (px > 0) stack.push(i - 1);
    if (px < width - 1) stack.push(i + 1);
    if (i >= width) stack.push(i - width);
    if (i < width * (height - 1)) stack.push(i + width);
  }
}

/** Outline of the rectangle spanned by two corners. */
export function drawRect(
  pixels: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: number,
): void {
  drawLine(pixels, width, height, x0, y0, x1, y0, c);
  drawLine(pixels, width, height, x1, y0, x1, y1, c);
  drawLine(pixels, width, height, x1, y1, x0, y1, c);
  drawLine(pixels, width, height, x0, y1, x0, y0, c);
}

/**
 * Quantises RGBA to palette indices. Exact colours missing from the palette are added (up to
 * MAX_COLORS); after that, pixels use the nearest colour. Alpha below 128 is transparent.
 * Returns the indices and the (possibly extended) palette.
 */
export function quantize(
  rgba: Uint8ClampedArray | Uint8Array,
  palette: readonly string[],
): { pixels: Uint8Array; palette: string[] } {
  const pal = palette.slice();
  const rgb = pal.map(parseHex);
  const exact = new Map<number, number>();
  rgb.forEach(([r, g, b], i) => exact.set((r << 16) | (g << 8) | b, i + 1));
  const pixels = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < pixels.length; i++) {
    if (rgba[i * 4 + 3]! < 128) continue;
    const r = rgba[i * 4]!;
    const g = rgba[i * 4 + 1]!;
    const b = rgba[i * 4 + 2]!;
    const key = (r << 16) | (g << 8) | b;
    let idx = exact.get(key);
    if (idx === undefined && pal.length < MAX_COLORS) {
      pal.push(toHex(r, g, b));
      rgb.push([r, g, b]);
      idx = pal.length;
      exact.set(key, idx);
    }
    if (idx === undefined) {
      let best = 0;
      let bestD = Infinity;
      rgb.forEach(([pr, pg, pb], j) => {
        const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
        if (d < bestD) {
          bestD = d;
          best = j + 1;
        }
      });
      idx = best;
    }
    pixels[i] = idx;
  }
  return { pixels, palette: pal };
}

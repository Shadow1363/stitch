import { describe, expect, it } from 'vitest';
import {
  blankImage,
  composite,
  decodeLayers,
  drawLine,
  drawRect,
  encodeLayers,
  floodFill,
  quantize,
  resizeImage,
} from './pixel';
import { blankMap, decodeTiles, encodeTiles, resizeMap } from './map';

const grid = (px: Uint8Array, w: number) =>
  Array.from({ length: px.length / w }, (_, y) =>
    Array.from(px.subarray(y * w, (y + 1) * w)).join(''),
  );

describe('pixel art', () => {
  it('draws lines and rectangles', () => {
    const img = blankImage(5, 4);
    const px = img.layers[0]!.pixels;
    drawLine(px, 5, 4, 0, 0, 4, 3, 1);
    expect(grid(px, 5)).toEqual(['10000', '01000', '00110', '00001']);
    px.fill(0);
    drawRect(px, 5, 4, 1, 0, 3, 2, 2);
    expect(grid(px, 5)).toEqual(['02220', '02020', '02220', '00000']);
  });

  it('resizes from the top-left: growing adds transparent pixels, shrinking crops', () => {
    const img = blankImage(2, 2);
    img.layers[0]!.pixels.set([1, 2, 3, 4]);
    const wide = resizeImage(img, 4, 2);
    expect(grid(wide.layers[0]!.pixels, 4)).toEqual(['1200', '3400']);
    expect(grid(resizeImage(wide, 1, 1).layers[0]!.pixels, 1)).toEqual(['1']);
  });

  it('flood fills a 4-connected region only', () => {
    const img = blankImage(4, 3);
    const px = img.layers[0]!.pixels;
    drawLine(px, 4, 3, 2, 0, 2, 2, 1);
    floodFill(px, 4, 3, 0, 0, 3);
    expect(grid(px, 4)).toEqual(['3310', '3310', '3310']);
  });

  it('composites visible layers over each other', () => {
    const img = blankImage(2, 1);
    img.layers.push({ name: 'top', visible: true, pixels: new Uint8Array([0, 2]) });
    img.layers[0]!.pixels.set([1, 1]);
    const rgba = composite(img, ['#ff0000', '#00ff00']);
    expect(Array.from(rgba)).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
    img.layers[1]!.visible = false;
    expect(Array.from(composite(img, ['#ff0000', '#00ff00']))).toEqual([
      255, 0, 0, 255, 255, 0, 0, 255,
    ]);
  });

  it('round-trips layers through base64', () => {
    const img = blankImage(3, 3);
    img.layers[0]!.pixels.set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(decodeLayers(3, 3, encodeLayers(img))).toEqual(img);
  });

  it('quantises exact colours into the palette, then nearest', () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 10, 20, 30, 255, 0, 0, 0, 0]);
    const r = quantize(rgba, ['#ff0000']);
    expect(Array.from(r.pixels)).toEqual([1, 2, 0]);
    expect(r.palette).toEqual(['#ff0000', '#0a141e']);
    const full = Array.from({ length: 255 }, () => '#000000');
    expect(
      quantize(new Uint8Array([250, 0, 0, 255]), ['#ff0000', ...full.slice(1)]).pixels[0],
    ).toBe(1);
  });
});

describe('tile maps', () => {
  it('encodes cells and resizes keeping the top-left', () => {
    const m = blankMap('t', 8, 3, 2);
    const cells = decodeTiles(m);
    cells.set([1, 2, 3, 4, 5, 6]);
    const r = resizeMap({ ...m, tiles: encodeTiles(cells) }, 2, 3);
    expect(Array.from(decodeTiles(r))).toEqual([1, 2, 4, 5, 0, 0]);
  });
});

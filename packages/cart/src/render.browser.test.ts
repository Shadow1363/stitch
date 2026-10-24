import { describe, expect, it } from 'vitest';
import { renderAsset, svgSize } from './render';
import { blankImage, encodeLayers } from './pixel';

const pixelsOf = (bmp: ImageBitmap) => {
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d')!;
  g.drawImage(bmp, 0, 0);
  return g.getImageData(0, 0, bmp.width, bmp.height).data;
};

describe('renderAsset', () => {
  it('composites pixel art through the palette', async () => {
    const img = blankImage(2, 1);
    img.layers[0]!.pixels.set([1, 2]);
    const bmp = await renderAsset(
      { kind: 'pixel', name: 'p', width: 2, height: 1, center: [1, 0], layers: encodeLayers(img) },
      ['#ff0000', '#0000ff'],
    );
    expect(Array.from(pixelsOf(bmp))).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
  });

  it('rasterises SVG at its declared size', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#00ff00"/></svg>';
    expect(svgSize(svg)).toEqual({ width: 20, height: 10 });
    const bmp = await renderAsset({ kind: 'svg', name: 's', svg, center: [10, 5] }, []);
    expect([bmp.width, bmp.height]).toEqual([20, 10]);
    expect(Array.from(pixelsOf(bmp).subarray(0, 4))).toEqual([0, 255, 0, 255]);
  });

  it('decodes PNG data URLs', async () => {
    const c = new OffscreenCanvas(3, 3);
    c.getContext('2d')!.fillRect(0, 0, 3, 3);
    const blob = await c.convertToBlob();
    const url = await new Promise<string>((r) => {
      const fr = new FileReader();
      fr.onload = () => r(fr.result as string);
      fr.readAsDataURL(blob);
    });
    const bmp = await renderAsset(
      { kind: 'png', name: 'x', data: url, pixelArt: false, center: [1, 1] },
      [],
    );
    expect(bmp.width).toBe(3);
  });
});

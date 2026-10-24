/**
 * Asset -> image (browser only). Shared by the editor and exported players, so a cart can be
 * drawn from its sources alone.
 */
import type { Asset, PixelAsset, SvgAsset } from './cart';
import { composite, decodeLayers } from './pixel';

export async function renderAsset(a: Asset, palette: readonly string[]): Promise<ImageBitmap> {
  switch (a.kind) {
    case 'png': {
      const res = await fetch(a.data);
      if (!res.ok) throw new Error(`asset ${a.name}: HTTP ${res.status}`);
      return createImageBitmap(await res.blob());
    }
    case 'pixel':
      return createImageBitmap(pixelImageData(a, palette));
    case 'svg':
      return rasterizeSvg(a);
  }
}

export function pixelImageData(a: PixelAsset, palette: readonly string[]): ImageData {
  const img = decodeLayers(a.width, a.height, a.layers);
  return new ImageData(composite(img, palette), a.width, a.height);
}

/** Width and height an SVG declares (falls back to its viewBox, then 100x100). */
export function svgSize(svg: string): { width: number; height: number } {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  const num = (v: string | null) => (v && !v.endsWith('%') ? parseFloat(v) : NaN);
  let width = num(doc.getAttribute('width'));
  let height = num(doc.getAttribute('height'));
  const vb = doc
    .getAttribute('viewBox')
    ?.split(/[\s,]+/)
    .map(Number);
  if ((!Number.isFinite(width) || !Number.isFinite(height)) && vb?.length === 4)
    [width, height] = [vb[2]!, vb[3]!];
  return {
    width: Number.isFinite(width) && width > 0 ? width : 100,
    height: Number.isFinite(height) && height > 0 ? height : 100,
  };
}

async function rasterizeSvg(a: SvgAsset): Promise<ImageBitmap> {
  const { width, height } = svgSize(a.svg);
  const url = URL.createObjectURL(new Blob([a.svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image(width, height);
    img.src = url;
    await img.decode();
    const canvas = new OffscreenCanvas(Math.ceil(width), Math.ceil(height));
    canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
    return canvas.transferToImageBitmap();
  } finally {
    URL.revokeObjectURL(url);
  }
}

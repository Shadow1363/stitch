import type { Asset } from '@stitch/cart';
import { renderAsset } from '@stitch/cart/render';

/** Svelte action: draws an asset into a canvas, letterboxed. Re-runs when the args change. */
export function thumb(
  canvas: HTMLCanvasElement,
  args: { asset: Asset; palette: readonly string[]; version: number },
) {
  let token = 0;
  const paint = async (a: typeof args) => {
    const mine = ++token;
    let bmp: ImageBitmap;
    try {
      bmp = await renderAsset(a.asset, a.palette);
    } catch {
      return;
    }
    if (mine !== token) return;
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, canvas.width, canvas.height);
    const s = Math.min(canvas.width / bmp.width, canvas.height / bmp.height);
    g.imageSmoothingEnabled =
      a.asset.kind !== 'pixel' && !(a.asset.kind === 'png' && a.asset.pixelArt);
    g.drawImage(
      bmp,
      (canvas.width - bmp.width * s) / 2,
      (canvas.height - bmp.height * s) / 2,
      bmp.width * s,
      bmp.height * s,
    );
  };
  void paint(args);
  return { update: (a: typeof args) => void paint(a) };
}

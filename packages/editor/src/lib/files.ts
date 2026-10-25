import { normalizeCart, type Cart } from '@stitch/cart';
import { embedCart, extractCart, isPng } from '@stitch/cart/png';
import type { ImportReport } from '@stitch/sb3';
import { fileToDataUrl, renderCostumes } from './assets';
import { renderCover } from './cover';
import { importScratch, isZip } from './scratch';

/** A loaded cart. `report` is set when it was imported from Scratch. */
export interface Opened {
  cart: Cart;
  report?: ImportReport;
}

/**
 * The cart with every PNG asset as a data: URL. An asset given as a URL (relative to the editor,
 * or on another host) would break once the cart or an export is opened somewhere else.
 */
export async function inlineAssets(cart: Cart): Promise<Cart> {
  const assets = { ...cart.assets };
  for (const [id, a] of Object.entries(assets)) {
    if (a.kind !== 'png' || a.data.startsWith('data:')) continue;
    const res = await fetch(new URL(a.data, location.href));
    if (!res.ok) throw new Error(`asset ${a.name}: HTTP ${res.status} from ${a.data}`);
    assets[id] = { ...a, data: await fileToDataUrl(await res.blob()) };
  }
  return { ...cart, assets };
}

/** Builds the `.stitch.png` file: cover image with the cart embedded. */
export async function cartToPng(source: Cart): Promise<Blob> {
  const cart = await inlineAssets(source);
  const cover = await renderCover(cart, await renderCostumes(cart.assets, cart.palette));
  return new Blob([embedCart(cover, cart) as Uint8Array<ArrayBuffer>], { type: 'image/png' });
}

/**
 * Reads a cart from `.stitch.png` bytes or cart JSON, or imports a Scratch 3 project (`.sb3`, a
 * zip). `name` is the file name, which titles an imported cart.
 */
export async function cartFromBytes(bytes: Uint8Array, name = ''): Promise<Opened> {
  if (isPng(bytes)) return { cart: extractCart(bytes) };
  if (isZip(bytes)) return importScratch(bytes, titleFrom(name));
  try {
    return { cart: normalizeCart(JSON.parse(new TextDecoder().decode(bytes))) };
  } catch (err) {
    throw new Error(`not a Stitch cart (${err instanceof Error ? err.message : String(err)})`);
  }
}

/** `Space Game.sb3` → `Space Game`. */
function titleFrom(name: string): string {
  const file = name.split(/[/\\]/).pop() ?? '';
  let base = file;
  try {
    base = decodeURIComponent(file);
  } catch {
    // A file name with a stray `%` isn't URL-encoded; keep it as it is.
  }
  base = base.replace(/\.sb3$/i, '');
  return base || 'Scratch project';
}

export async function cartFromFile(file: File): Promise<Opened> {
  return cartFromBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}

/** Loads a cart (or a Scratch project) by URL. The host must allow CORS for the editor's origin. */
export async function cartFromUrl(url: string): Promise<Opened> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(
      `couldn't fetch ${url} (offline, or the server doesn't allow cross-origin requests)`,
    );
  }
  if (!res.ok) throw new Error(`couldn't fetch ${url}: HTTP ${res.status}`);
  return cartFromBytes(
    new Uint8Array(await res.arrayBuffer()),
    new URL(url, location.href).pathname,
  );
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function cartFilename(cart: Cart): string {
  const slug =
    cart.meta.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'cart';
  return `${slug}.stitch.png`;
}

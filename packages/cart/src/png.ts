/**
 * Carts as PNG files: the cover image is an ordinary PNG, and the cart JSON rides in a private
 * ancillary chunk `stCt` (zlib-compressed), so image viewers show the cover and ignore the data.
 * Chunk data: one format byte (1), then zlib(UTF-8 JSON).
 */
import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate';
import { normalizeCart, type Cart } from './cart';

/** ancillary (s), private (t), reserved-uppercase (C), safe-to-copy (t). */
export const CART_CHUNK = 'stCt';
const CHUNK_FORMAT = 1;
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface Chunk {
  type: string;
  data: Uint8Array;
}

export function isPng(bytes: Uint8Array): boolean {
  return SIGNATURE.every((b, i) => bytes[i] === b);
}

function readChunks(png: Uint8Array): Chunk[] {
  if (!isPng(png)) throw new Error('not a PNG file');
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Chunk[] = [];
  let p = 8;
  while (p + 12 <= png.length) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(...png.subarray(p + 4, p + 8));
    if (p + 12 + len > png.length) throw new Error('truncated PNG');
    const data = png.subarray(p + 8, p + 8 + len);
    const crc = view.getUint32(p + 8 + len);
    if (crc32(png.subarray(p + 4, p + 8 + len)) !== crc)
      throw new Error(`corrupt PNG chunk ${type}`);
    chunks.push({ type, data });
    p += 12 + len;
    if (type === 'IEND') break;
  }
  return chunks;
}

function writeChunks(chunks: Chunk[]): Uint8Array {
  const size = 8 + chunks.reduce((n, c) => n + 12 + c.data.length, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out.set(SIGNATURE, 0);
  let p = 8;
  for (const c of chunks) {
    view.setUint32(p, c.data.length);
    const typeBytes = strToU8(c.type);
    out.set(typeBytes, p + 4);
    out.set(c.data, p + 8);
    view.setUint32(p + 8 + c.data.length, crc32(out.subarray(p + 4, p + 8 + c.data.length)));
    p += 12 + c.data.length;
  }
  return out;
}

/** Returns a copy of `cover` carrying `cart`; any previous cart chunk is replaced. */
export function embedCart(cover: Uint8Array, cart: Cart): Uint8Array {
  const chunks = readChunks(cover).filter((c) => c.type !== CART_CHUNK);
  const body = zlibSync(strToU8(JSON.stringify(cart)), { level: 9 });
  const data = new Uint8Array(body.length + 1);
  data[0] = CHUNK_FORMAT;
  data.set(body, 1);
  const end = chunks.findIndex((c) => c.type === 'IEND');
  chunks.splice(end < 0 ? chunks.length : end, 0, { type: CART_CHUNK, data });
  return writeChunks(chunks);
}

/** Reads the cart from a cart PNG. Throws if the PNG carries none. */
export function extractCart(png: Uint8Array): Cart {
  const chunk = readChunks(png).find((c) => c.type === CART_CHUNK);
  if (!chunk) throw new Error('this PNG is not a Stitch cart');
  if (chunk.data[0] !== CHUNK_FORMAT) throw new Error(`unknown cart chunk format ${chunk.data[0]}`);
  return normalizeCart(JSON.parse(strFromU8(unzlibSync(chunk.data.subarray(1)))));
}

/** Minimal RGBA PNG encoder (for covers generated outside a browser, and tests). */
export function encodePng(
  width: number,
  height: number,
  rgba: Uint8Array | Uint8ClampedArray,
): Uint8Array {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++)
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return writeChunks([
    { type: 'IHDR', data: ihdr },
    { type: 'IDAT', data: zlibSync(raw) },
    { type: 'IEND', data: new Uint8Array(0) },
  ]);
}

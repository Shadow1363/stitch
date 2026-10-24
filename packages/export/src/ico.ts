// No imports, so Node scripts (the editor's icon generator) can load it directly.

/** A one-image ICO wrapping a PNG (Windows Vista and later read PNG entries). */
export function pngToIco(png: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(6 + 16 + png.length);
  const v = new DataView(out.buffer);
  v.setUint16(2, 1, true); // type: icon
  v.setUint16(4, 1, true); // one image
  out[6] = size >= 256 ? 0 : size; // 0 means 256
  out[7] = size >= 256 ? 0 : size;
  v.setUint16(10, 1, true); // colour planes
  v.setUint16(12, 32, true); // bits per pixel
  v.setUint32(14, png.length, true);
  v.setUint32(18, 22, true); // offset of the image data
  out.set(png, 22);
  return out;
}

import { fromBase64, toBase64 } from './bytes';

/**
 * A tile map drawn behind sprites, anchored at the stage's top-left. Cell value 0 is empty;
 * value t >= 1 draws tile t-1 of the tileset (row-major over its grid).
 */
export interface TileMap {
  /** Asset id of the tileset image. */
  tileset: string;
  tileSize: number;
  width: number;
  height: number;
  /** Base64 of width*height little-endian uint16 cells. */
  tiles: string;
}

export function decodeTiles(m: TileMap): Uint16Array {
  const bytes = fromBase64(m.tiles);
  const out = new Uint16Array(m.width * m.height);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < out.length && i * 2 + 1 < bytes.length; i++)
    out[i] = view.getUint16(i * 2, true);
  return out;
}

export function encodeTiles(cells: Uint16Array): string {
  const bytes = new Uint8Array(cells.length * 2);
  const view = new DataView(bytes.buffer);
  cells.forEach((v, i) => view.setUint16(i * 2, v, true));
  return toBase64(bytes);
}

export function blankMap(
  tileset: string,
  tileSize: number,
  width: number,
  height: number,
): TileMap {
  return { tileset, tileSize, width, height, tiles: encodeTiles(new Uint16Array(width * height)) };
}

/** Resizes a map, keeping cells that still fit (anchored top-left). */
export function resizeMap(m: TileMap, width: number, height: number): TileMap {
  const old = decodeTiles(m);
  const next = new Uint16Array(width * height);
  for (let y = 0; y < Math.min(height, m.height); y++)
    for (let x = 0; x < Math.min(width, m.width); x++) next[y * width + x] = old[y * m.width + x]!;
  return { ...m, width, height, tiles: encodeTiles(next) };
}

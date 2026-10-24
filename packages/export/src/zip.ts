import { strToU8, zipSync, type Zippable } from 'fflate';
import type { FileSet } from './pwa';

/** Zips a file set under `folder/`. Already-compressed PNGs are stored, not deflated again. */
export function zipFiles(files: FileSet, folder: string): Uint8Array {
  const tree: Zippable = {};
  for (const [path, data] of Object.entries(files))
    tree[`${folder}/${path}`] =
      typeof data === 'string' ? strToU8(data) : [data, { level: path.endsWith('.png') ? 0 : 6 }];
  return zipSync(tree, { level: 6 });
}

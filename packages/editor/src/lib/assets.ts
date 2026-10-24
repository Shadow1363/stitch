// Shared with exported players, which render their carts the same way.
export { renderCostumes } from '@stitch/export/payload';

/** Reads a File as a data: URL. */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/**
 * Opening Scratch 3 projects: `@stitch/sb3` does the converting; this supplies the browser steps
 * it can't do purely (MP3 decoding, bitmap scaling) and words the report for a dialog.
 */
import type { DecodedAudio } from '@stitch/cart';
import { importSb3, type ImportReport, type ImportResult } from '@stitch/sb3';

export { isZip } from '@stitch/sb3';

export function importScratch(bytes: Uint8Array, title: string): Promise<ImportResult> {
  return importSb3(bytes, { title, decodeAudio, scaleBitmap });
}

async function decodeAudio(bytes: Uint8Array): Promise<DecodedAudio> {
  // The context's rate is what decodeAudioData resamples to; 48 kHz is the most a cart stores.
  const ctx = new OfflineAudioContext(1, 1, 48000);
  const buf = await ctx.decodeAudioData(bytes.slice().buffer);
  return {
    rate: buf.sampleRate,
    channels: Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i)),
  };
}

async function scaleBitmap(bytes: Uint8Array, mime: string, factor: number): Promise<Uint8Array> {
  const bmp = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }));
  const w = Math.max(1, Math.round(bmp.width * factor));
  const h = Math.max(1, Math.round(bmp.height * factor));
  const canvas = new OffscreenCanvas(w, h);
  const g = canvas.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The report as dialog text, or undefined when everything came across as it was. */
export function describeImport(r: ImportReport): string | undefined {
  const unsupported = Object.entries(r.unsupported).sort((a, b) => b[1] - a[1]);
  if (!unsupported.length && !r.renamed.length && !r.dropped && !r.notes.length) return undefined;
  const parts = [
    `Brought in ${plural(r.sprites, 'sprite')}, ${plural(r.costumes, 'costume')}, ${plural(r.sounds, 'sound')} and ${plural(r.scripts, 'script')}.`,
  ];
  if (unsupported.length)
    parts.push(
      `These blocks have no Stitch equivalent, so each became a “-- sb3:” comment where it was:\n${unsupported
        .map(([op, n]) => `• ${op}${n > 1 ? ` (${n})` : ''}`)
        .join('\n')}`,
    );
  if (r.renamed.length) {
    const shown = r.renamed.slice(0, 8).map((x) => `• ${x.from} → ${x.to} (${x.target})`);
    if (r.renamed.length > 8) shown.push(`• and ${r.renamed.length - 8} more`);
    parts.push(`Renamed to fit Stitch:\n${shown.join('\n')}`);
  }
  if (r.dropped)
    parts.push(
      `Left out ${plural(r.dropped, 'loose block')} not under a hat; Scratch never runs those either.`,
    );
  if (r.notes.length) {
    const shown = r.notes.slice(0, 10).map((n) => `• ${n}`);
    if (r.notes.length > 10) shown.push(`• and ${r.notes.length - 10} more`);
    parts.push(shown.join('\n'));
  }
  return parts.join('\n\n');
}

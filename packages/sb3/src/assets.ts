/** Scratch costumes and sounds → cart assets and sounds. */
import {
  decodeWav,
  mixDown,
  sampleSound,
  toBase64,
  type Asset,
  type DecodedAudio,
  type Sound,
} from '@stitch/cart';
import { strFromU8 } from 'fflate';
import { uniqueLabel } from './names';
import type { Sb3Costume, Sb3Sound } from './project';
import type { ImportReport } from './report';

/** Browser-only steps the importer can't do purely; the editor passes them in. */
export interface ImportHooks {
  /** Decodes compressed audio (MP3), which has no pure decoder here. */
  decodeAudio?(bytes: Uint8Array, format: string): Promise<DecodedAudio>;
  /**
   * Scales a bitmap by `factor` and returns it as PNG. Most Scratch bitmaps are saved at twice
   * their size (`bitmapResolution: 2`) and drawn at half; this brings them back to stage size.
   */
  scaleBitmap?(bytes: Uint8Array, mime: string, factor: number): Promise<Uint8Array>;
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

const fileOf = (a: { md5ext?: string; assetId?: string; dataFormat: string }) =>
  a.md5ext ?? `${a.assetId ?? ''}.${a.dataFormat}`;

/** Drawn when a costume's file is missing, so the sprite still has something to show. */
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2" viewBox="0 0 2 2"></svg>';

export async function costumeAsset(
  c: Sb3Costume,
  files: Record<string, Uint8Array>,
  hooks: ImportHooks,
  report: ImportReport,
  where: string,
): Promise<Asset> {
  const bytes = files[fileOf(c)];
  const format = c.dataFormat.toLowerCase();
  const res = c.bitmapResolution && c.bitmapResolution > 0 ? c.bitmapResolution : 1;
  const center: [number, number] = [(c.rotationCenterX ?? 0) / res, (c.rotationCenterY ?? 0) / res];
  if (!bytes) {
    report.notes.push(`${where}: costume "${c.name}" is missing from the file`);
    return { kind: 'svg', name: c.name, center: [1, 1], svg: PLACEHOLDER_SVG };
  }
  if (format === 'svg') return { kind: 'svg', name: c.name, center, svg: strFromU8(bytes) };
  const mime = MIME[format] ?? 'image/png';
  let data = bytes;
  let type = mime;
  let at = center;
  if (res !== 1) {
    if (hooks.scaleBitmap) {
      data = await hooks.scaleBitmap(bytes, mime, 1 / res);
      type = 'image/png';
    } else {
      // Without a way to scale, keep the full image; it draws `res` times too big.
      at = [center[0] * res, center[1] * res];
      report.notes.push(`${where}: costume "${c.name}" kept at ${res}× size`);
    }
  }
  return {
    kind: 'png',
    name: c.name,
    center: at,
    data: `data:${type};base64,${toBase64(data)}`,
    pixelArt: false,
  };
}

/**
 * Builds the cart's one sound bank from every target's sounds (D16, D36). The same recording
 * under the same name is shared; a different one with a taken name gets a number.
 */
export class SoundBank {
  readonly sounds: Record<string, Sound> = {};
  private readonly names = new Set<string>();
  /** `file|name` → sound id, so identical sounds are stored once. */
  private readonly byFile = new Map<string, string>();
  private next = 1;

  constructor(
    private readonly files: Record<string, Uint8Array>,
    private readonly hooks: ImportHooks,
    private readonly report: ImportReport,
  ) {}

  /** Adds a target's sound and returns its name in the cart, or undefined if it can't be read. */
  async add(s: Sb3Sound, where: string): Promise<string | undefined> {
    const file = fileOf(s);
    const shared = this.byFile.get(`${file}|${s.name}`);
    if (shared) return this.sounds[shared]!.name;
    const bytes = this.files[file];
    if (!bytes) {
      this.report.notes.push(`${where}: sound "${s.name}" is missing from the file`);
      return undefined;
    }
    let audio: DecodedAudio;
    try {
      const format = s.dataFormat.toLowerCase();
      if (format === 'wav') audio = decodeWav(bytes);
      else if (this.hooks.decodeAudio) audio = await this.hooks.decodeAudio(bytes, format);
      else throw new Error(`no decoder for ${format}`);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      this.report.notes.push(`${where}: sound "${s.name}" couldn't be read (${why})`);
      return undefined;
    }
    const name = uniqueLabel(s.name, this.names);
    if (name !== s.name)
      this.report.renamed.push({ kind: 'sound', from: s.name, to: name, target: where });
    const id = `snd${this.next++}`;
    this.sounds[id] = sampleSound(name, mixDown(audio), audio.rate);
    this.byFile.set(`${file}|${s.name}`, id);
    this.report.sounds++;
    return name;
  }
}

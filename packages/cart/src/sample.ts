/** Recorded sounds: mono PCM in and out of the cart's base64 form, and WAV decoding. Pure. */
import { fromBase64, toBase64 } from './bytes';
import { MAX_SAMPLE_RATE, type SampleSound } from './sfx';

/** Samples in -1..1 as base64 16-bit little-endian PCM. */
export function encodePcm(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const v = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    v.setInt16(i * 2, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
  }
  return toBase64(bytes);
}

export function decodePcm(data: string): Float32Array {
  const bytes = fromBase64(data);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(bytes.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = v.getInt16(i * 2, true) / 0x8000;
  return out;
}

/** Linear resampling; good enough for bringing a rate down to MAX_SAMPLE_RATE. */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const out = new Float32Array(Math.max(1, Math.round((samples.length * to) / from)));
  const step = from / to;
  for (let i = 0; i < out.length; i++) {
    const p = i * step;
    const j = Math.floor(p);
    const a = samples[j] ?? 0;
    const b = samples[j + 1] ?? a;
    out[i] = a + (b - a) * (p - j);
  }
  return out;
}

/** A cart sound from mono samples, resampled down if the rate is above MAX_SAMPLE_RATE. */
export function sampleSound(name: string, samples: Float32Array, rate: number): SampleSound {
  const r = Math.min(Math.round(rate), MAX_SAMPLE_RATE);
  return { kind: 'sample', name, rate: r, data: encodePcm(resample(samples, rate, r)) };
}

/** Decoded audio: one channel per entry, all the same length. */
export interface DecodedAudio {
  rate: number;
  channels: Float32Array[];
}

/** Averages channels into one. */
export function mixDown(a: DecodedAudio): Float32Array {
  const [first, ...rest] = a.channels;
  if (!first) return new Float32Array(0);
  if (!rest.length) return first;
  const out = new Float32Array(first.length);
  for (const ch of a.channels) for (let i = 0; i < out.length; i++) out[i]! += ch[i] ?? 0;
  for (let i = 0; i < out.length; i++) out[i]! /= a.channels.length;
  return out;
}

const IMA_STEPS = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73,
  80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494,
  544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499,
  2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487,
  12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
];
const IMA_INDEX = [-1, -1, -1, -1, 2, 4, 6, 8];

/**
 * Reads a WAV file: integer PCM (8, 16, 24 or 32 bit), 32-bit float, or IMA ADPCM, which is what
 * Scratch records and browsers can't decode. Throws on anything else.
 */
export function decodeWav(bytes: Uint8Array): DecodedAudio {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE')
    throw new Error('not a WAV file');
  let fmt: { format: number; channels: number; rate: number; align: number; bits: number } | null =
    null;
  let data: Uint8Array | null = null;
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = tag(at);
    const size = v.getUint32(at + 4, true);
    const body = at + 8;
    if (id === 'fmt ')
      fmt = {
        format: v.getUint16(body, true),
        channels: v.getUint16(body + 2, true),
        rate: v.getUint32(body + 4, true),
        align: v.getUint16(body + 12, true),
        bits: v.getUint16(body + 14, true),
      };
    else if (id === 'data') data = bytes.subarray(body, Math.min(bytes.length, body + size));
    at = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('WAV file has no fmt or data chunk');
  const { channels, rate } = fmt;
  if (channels < 1) throw new Error('WAV file has no channels');
  // WAVE_FORMAT_EXTENSIBLE keeps the real format in its sub-format GUID; the common ones are PCM.
  const format = fmt.format === 0xfffe ? (fmt.bits === 32 ? 3 : 1) : fmt.format;
  if (format === 0x11) return { rate, channels: decodeIma(data, channels, fmt.align) };
  const d = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = fmt.bits / 8;
  const frames = Math.floor(data.length / (width * channels));
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  const read: ((at: number) => number) | null =
    format === 3 && fmt.bits === 32
      ? (at) => d.getFloat32(at, true)
      : format !== 1
        ? null
        : fmt.bits === 8
          ? (at) => (d.getUint8(at) - 128) / 128
          : fmt.bits === 16
            ? (at) => d.getInt16(at, true) / 0x8000
            : fmt.bits === 24
              ? (at) => ((d.getUint8(at + 2) << 24) | (d.getUint16(at, true) << 8)) / 2 ** 31
              : fmt.bits === 32
                ? (at) => d.getInt32(at, true) / 2 ** 31
                : null;
  if (!read) throw new Error(`unsupported WAV encoding (format ${fmt.format}, ${fmt.bits}-bit)`);
  for (let f = 0; f < frames; f++)
    for (let c = 0; c < channels; c++) out[c]![f] = read((f * channels + c) * width);
  return { rate, channels: out };
}

/**
 * IMA ADPCM, from the IMA/Microsoft spec. Each block starts with a 4-byte header per channel
 * (first sample, step index), then 4-bit codes in groups of 4 bytes per channel, low nibble first.
 */
function decodeIma(data: Uint8Array, channels: number, align: number): Float32Array[] {
  if (align <= 4 * channels) throw new Error('bad IMA ADPCM block size');
  const perBlock = ((align - 4 * channels) * 8) / (4 * channels) + 1;
  const blocks = Math.ceil(data.length / align);
  const out = Array.from({ length: channels }, () => new Float32Array(blocks * perBlock));
  let n = 0;
  for (let b = 0; b < blocks; b++) {
    const start = b * align;
    const end = Math.min(data.length, start + align);
    if (end - start < 4 * channels) break;
    const pred: number[] = [];
    const index: number[] = [];
    for (let c = 0; c < channels; c++) {
      const h = start + c * 4;
      pred[c] = ((data[h]! | (data[h + 1]! << 8)) << 16) >> 16;
      index[c] = Math.min(88, Math.max(0, data[h + 2]!));
      out[c]![n] = pred[c]! / 0x8000;
    }
    let count = 1;
    // Interleaved: 4 bytes (8 samples) of channel 0, then 4 of channel 1, and so on.
    for (let at = start + 4 * channels; at + 4 * channels <= end; at += 4 * channels) {
      for (let c = 0; c < channels; c++)
        for (let k = 0; k < 8; k++) {
          const byte = data[at + c * 4 + (k >> 1)]!;
          const code = k & 1 ? byte >> 4 : byte & 15;
          const step = IMA_STEPS[index[c]!]!;
          let diff = step >> 3;
          if (code & 1) diff += step >> 2;
          if (code & 2) diff += step >> 1;
          if (code & 4) diff += step;
          const p = Math.max(-32768, Math.min(32767, pred[c]! + (code & 8 ? -diff : diff)));
          pred[c] = p;
          index[c] = Math.min(88, Math.max(0, index[c]! + IMA_INDEX[code & 7]!));
          out[c]![n + count + k] = p / 0x8000;
        }
      count += 8;
    }
    n += count;
  }
  return out.map((ch) => ch.subarray(0, n));
}

import { describe, expect, it } from 'vitest';
import { encodeWav } from './audio';
import { decodePcm, decodeWav, encodePcm, mixDown, resample, sampleSound } from './sample';

const round = (a: Float32Array, places = 3) =>
  [...a].map((v) => Math.round(v * 10 ** places) / 10 ** places);

/** A RIFF/WAVE file with one `fmt ` chunk and one `data` chunk. */
function wav(
  fmt: { format: number; channels: number; rate: number; align: number; bits: number },
  data: number[],
) {
  const bytes = new Uint8Array(44 + data.length);
  const v = new DataView(bytes.buffer);
  const str = (at: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + data.length, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, fmt.format, true);
  v.setUint16(22, fmt.channels, true);
  v.setUint32(24, fmt.rate, true);
  v.setUint32(28, fmt.rate * fmt.align, true);
  v.setUint16(32, fmt.align, true);
  v.setUint16(34, fmt.bits, true);
  str(36, 'data');
  v.setUint32(40, data.length, true);
  bytes.set(data, 44);
  return bytes;
}

describe('recorded sounds', () => {
  it('round-trips samples through base64 PCM', () => {
    const s = Float32Array.of(0, 0.25, -0.25, 1, -1);
    expect(round(decodePcm(encodePcm(s)))).toEqual([0, 0.25, -0.25, 1, -1]);
  });

  it('resamples linearly', () => {
    expect(round(resample(Float32Array.of(0, 1, 0, -1), 4, 8))).toEqual([
      0, 0.5, 1, 0.5, 0, -0.5, -1, -1,
    ]);
    expect(round(resample(Float32Array.of(0, 1, 0, -1), 4, 2))).toEqual([0, 0]);
  });

  it('caps the stored rate', () => {
    const s = sampleSound('hi', new Float32Array(96000), 96000);
    expect(s.rate).toBe(48000);
    expect(decodePcm(s.data).length).toBe(48000);
  });

  it('mixes channels down', () => {
    expect(
      round(mixDown({ rate: 1, channels: [Float32Array.of(1, 0), Float32Array.of(0, 0.5)] })),
    ).toEqual([0.5, 0.25]);
  });
});

describe('decodeWav', () => {
  it('reads 16-bit PCM', () => {
    const a = decodeWav(encodeWav(Float32Array.of(0, 0.5, -0.5), 22050));
    expect(a.rate).toBe(22050);
    expect(round(a.channels[0]!)).toEqual([0, 0.5, -0.5]);
  });

  it('reads 8-bit and stereo PCM', () => {
    const a = decodeWav(
      wav({ format: 1, channels: 2, rate: 8000, align: 2, bits: 8 }, [128, 192, 64, 128]),
    );
    expect(a.channels.map((c) => round(c))).toEqual([
      [0, -0.5],
      [0.5, 0],
    ]);
  });

  it('reads IMA ADPCM, which Scratch records', () => {
    // One mono block: header (first sample 0, step index 0), then 4 bytes of codes. Code 7 adds
    // the whole step (7, then 16 after the index moves up 8); code 0xf subtracts it.
    const a = decodeWav(
      wav(
        { format: 0x11, channels: 1, rate: 22050, align: 8, bits: 4 },
        [0, 0, 0, 0, 0x77, 0xf0, 0, 0],
      ),
    );
    expect(a.channels[0]!.length).toBe(9);
    expect(Math.round(a.channels[0]![0]! * 0x8000)).toBe(0);
    expect(Math.round(a.channels[0]![1]! * 0x8000)).toBe(11);
    expect(Math.round(a.channels[0]![2]! * 0x8000)).toBe(41);
    // Code 0 adds step/8 (34 at index 16, so 4); then code 0xf subtracts most of step 31.
    expect(Math.round(a.channels[0]![3]! * 0x8000)).toBe(45);
    expect(Math.round(a.channels[0]![4]! * 0x8000)).toBeLessThan(0);
  });

  it('rejects files that are not WAV', () => {
    expect(() => decodeWav(new Uint8Array(20))).toThrow(/not a WAV/);
    expect(() =>
      decodeWav(wav({ format: 2, channels: 1, rate: 8000, align: 1, bits: 4 }, [0])),
    ).toThrow(/unsupported/);
  });
});

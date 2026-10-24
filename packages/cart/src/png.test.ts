import { describe, expect, it } from 'vitest';
import { IR_VERSION } from '@stitch/ir';
import { parse } from '@stitch/lang';
import { normalizeCart, type Cart } from './cart';
import { CART_CHUNK, embedCart, encodePng, extractCart, isPng } from './png';

const cart: Cart = normalizeCart({
  format: 'stitch-cart',
  version: 2,
  meta: { title: 'Test' },
  project: {
    irVersion: IR_VERSION,
    stage: { items: [] },
    sprites: [{ id: 'p', name: 'P', module: parse('on start do\n  move(10)\nend').module }],
  },
  sprites: [{ id: 'p', name: 'P', costumes: ['c'] }],
  assets: {
    c: {
      kind: 'pixel',
      name: 'c',
      width: 2,
      height: 2,
      center: [1, 1],
      layers: [{ name: 'L', visible: true, data: 'AQIDBA==' }],
    },
  },
});

const cover = encodePng(2, 2, new Uint8Array(16).fill(200));

describe('cart PNG', () => {
  it('embeds and extracts a cart without changing it', () => {
    const file = embedCart(cover, cart);
    expect(isPng(file)).toBe(true);
    expect(new TextDecoder('latin1').decode(file)).toContain(CART_CHUNK);
    expect(extractCart(file)).toEqual(cart);
  });

  it('keeps the cover image chunks intact', () => {
    const file = embedCart(cover, cart);
    expect(file.subarray(0, 33)).toEqual(cover.subarray(0, 33)); // signature + IHDR
    expect(file.length).toBeGreaterThan(cover.length);
  });

  it('replaces an existing cart chunk on re-save', () => {
    const once = embedCart(cover, cart);
    const twice = embedCart(once, { ...cart, meta: { title: 'Renamed' } });
    expect(extractCart(twice).meta.title).toBe('Renamed');
    expect(twice.length).toBeLessThan(once.length + 40);
  });

  it('rejects PNGs without a cart and corrupt files', () => {
    expect(() => extractCart(cover)).toThrow(/not a Stitch cart/);
    const bad = embedCart(cover, cart);
    bad[bad.length - 20] = bad[bad.length - 20]! ^ 0xff;
    expect(() => extractCart(bad)).toThrow(/corrupt|incorrect|invalid/i);
    expect(() => extractCart(new Uint8Array([1, 2, 3]))).toThrow(/not a PNG/);
  });
});

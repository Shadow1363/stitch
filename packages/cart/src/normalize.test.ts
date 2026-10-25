import { describe, expect, it } from 'vitest';
import { IR_VERSION } from '@stitch/ir';
import {
  CART_VERSION,
  DEFAULT_PALETTE,
  DEFAULT_SFX,
  emptyMusic,
  DEFAULT_STAGE,
  normalizeCart,
  normalizeStage,
} from './index';

const project = { irVersion: IR_VERSION, stage: { items: [] }, sprites: [] };

describe('stage settings', () => {
  it('defaults to Scratch geometry', () => {
    expect(normalizeStage(undefined)).toEqual({
      width: 480,
      height: 360,
      origin: 'center',
      yAxis: 'up',
      scaling: { mode: 'fit', filter: 'smooth' },
      background: '#ffffff',
      cloneLimit: 300,
    });
  });

  it('keeps a valid clone limit and replaces an invalid one', () => {
    expect(normalizeStage({ cloneLimit: 50 }).cloneLimit).toBe(50);
    expect(normalizeStage({ cloneLimit: -1 }).cloneLimit).toBe(300);
    expect(normalizeStage({ cloneLimit: 2.5 }).cloneLimit).toBe(300);
  });

  it('keeps valid fields and replaces invalid ones', () => {
    expect(
      normalizeStage({
        width: 320,
        height: -1,
        origin: 'top-left',
        yAxis: 'sideways',
        scaling: { filter: 'pixel' },
      }),
    ).toEqual({
      ...DEFAULT_STAGE,
      width: 320,
      origin: 'top-left',
      scaling: { mode: 'fit', filter: 'pixel' },
    });
  });
});

describe('cart', () => {
  it('fills defaults for a minimal cart', () => {
    const cart = normalizeCart({
      format: 'stitch-cart',
      version: 2,
      project,
      sprites: [{ id: 'p', name: 'Player' }],
    });
    expect(cart.version).toBe(CART_VERSION);
    expect(cart.palette).toEqual(DEFAULT_PALETTE);
    expect(cart.stage).toEqual(normalizeStage(undefined));
    expect(cart.sprites[0]).toEqual({
      id: 'p',
      name: 'Player',
      x: 0,
      y: 0,
      direction: 90,
      size: 100,
      visible: true,
      layer: 0,
      costumes: [],
      costume: 1,
    });
  });

  it('migrates v1 carts: PNG assets gain a kind, the palette gets defaults', () => {
    const v1 = {
      format: 'stitch-cart',
      version: 1,
      project,
      assets: {
        a: { type: 'image/png', data: '/a.png', pixelArt: true, center: [4, 4], name: 'a' },
      },
    };
    const cart = normalizeCart(v1);
    expect(cart.version).toBe(CART_VERSION);
    expect(cart.assets.a).toEqual({
      kind: 'png',
      name: 'a',
      data: '/a.png',
      pixelArt: true,
      center: [4, 4],
    });
    expect(cart.palette).toEqual(DEFAULT_PALETTE);
  });

  it('migrates v2 carts: no sounds and empty music', () => {
    const cart = normalizeCart({ format: 'stitch-cart', version: 2, project });
    expect(cart.sounds).toEqual({});
    expect(cart.music).toEqual(emptyMusic());
  });

  it('migrates v5 carts to no backdrops, and keeps valid backdrops', () => {
    const old = normalizeCart({ format: 'stitch-cart', version: 5, project });
    expect([old.backdrops, old.backdrop]).toEqual([[], 1]);
    const cart = normalizeCart({
      format: 'stitch-cart',
      version: 6,
      project,
      backdrops: ['a', 'b'],
      backdrop: 2,
    });
    expect([cart.backdrops, cart.backdrop]).toEqual([['a', 'b'], 2]);
    const bad = normalizeCart({
      format: 'stitch-cart',
      version: 6,
      project,
      backdrops: [1],
      backdrop: 0,
    });
    expect([bad.backdrops, bad.backdrop]).toEqual([[], 1]);
  });

  it('keeps valid recorded sounds and drops broken ones', () => {
    const cart = normalizeCart({
      format: 'stitch-cart',
      version: 6,
      project,
      sounds: {
        ok: { kind: 'sample', name: 'meow', rate: 22050, data: 'AAA=' },
        fast: { kind: 'sample', name: 'f', rate: 96000, data: 'AAA=' },
        empty: { kind: 'sample', name: 'e', rate: 22050 },
      },
    });
    expect(cart.version).toBe(7);
    expect(cart.sounds).toEqual({
      ok: { kind: 'sample', name: 'meow', rate: 22050, data: 'AAA=' },
    });
  });

  it('fills and clamps sound parameters', () => {
    const cart = normalizeCart({
      format: 'stitch-cart',
      version: 3,
      project,
      sounds: { s1: { name: 'zap', params: { wave: 'noise', freq: 7, slide: -3 } } },
    });
    expect(cart.sounds.s1).toEqual({
      kind: 'sfx',
      name: 'zap',
      params: { ...DEFAULT_SFX, wave: 'noise', freq: 1, slide: -1 },
    });
  });

  it('keeps music references valid', () => {
    const cart = normalizeCart({
      format: 'stitch-cart',
      version: 3,
      project,
      music: {
        patterns: { p1: { name: 'A', rows: 2, cells: [[{ note: 60, inst: 'i1' }]] } },
        songs: { s1: { name: 'theme', bpm: 999, order: ['p1', 'gone'] } },
      },
    });
    expect(cart.music.patterns.p1!.cells).toEqual([
      [{ note: 60, inst: 'i1' }, null, null, null],
      [null, null, null, null],
    ]);
    expect(cart.music.songs.s1).toEqual({ name: 'theme', bpm: 400, order: ['p1'], loop: true });
  });

  it('migrates v3 to v4 with no extensions, and keeps only valid, unique ones', () => {
    expect(normalizeCart({ format: 'stitch-cart', version: 3, project }).extensions).toEqual([]);
    const manifest = {
      id: 'text',
      name: 'Text',
      version: '1',
      color: '#123456',
      blocks: [{ name: 'text_up', kind: 'reporter', label: 'up %1', params: [{ name: 's' }] }],
    };
    const cart = normalizeCart({
      format: 'stitch-cart',
      version: 4,
      project,
      extensions: [
        { manifest, code: 'stitch.define("text_up", (s) => s)' },
        { manifest, code: 'duplicate id' },
        { manifest: { ...manifest, id: 'Bad!' }, code: '' },
        { manifest: { ...manifest, id: 'nocode' } },
      ],
    });
    expect(cart.extensions.map((e) => e.manifest.id)).toEqual(['text']);
    expect(cart.extensions[0]!.manifest.blocks[0]!.params[0]!.type).toBe('any');
  });

  it('rejects other formats and newer versions', () => {
    expect(() => normalizeCart({ format: 'zip', version: 1, project })).toThrow(/format/);
    expect(() =>
      normalizeCart({ format: 'stitch-cart', version: CART_VERSION + 1, project }),
    ).toThrow(/newer/);
  });
});

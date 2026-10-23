import { describe, expect, it } from 'vitest';
import { IR_VERSION } from '@stitch/ir';
import { CART_VERSION, DEFAULT_STAGE, normalizeCart, normalizeStage } from './index';

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
    });
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
      version: 1,
      project,
      sprites: [{ id: 'p', name: 'Player' }],
    });
    expect(cart.version).toBe(CART_VERSION);
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

  it('rejects other formats and newer versions', () => {
    expect(() => normalizeCart({ format: 'zip', version: 1, project })).toThrow(/format/);
    expect(() =>
      normalizeCart({ format: 'stitch-cart', version: CART_VERSION + 1, project }),
    ).toThrow(/newer/);
  });
});

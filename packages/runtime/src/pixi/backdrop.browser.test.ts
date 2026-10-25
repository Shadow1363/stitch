import { afterEach, describe, expect, it } from 'vitest';
import { normalizeStage } from '@stitch/cart';
import { createBuiltins } from '../core/builtins';
import { World } from '../core/world';
import { PixiRenderer } from './stage';
import { texturesFromCostumes } from './textures';

const renderers: PixiRenderer[] = [];
afterEach(() => {
  for (const r of renderers.splice(0)) r.destroy();
  document.body.innerHTML = '';
});

async function image(w: number, h: number, draw: (g: OffscreenCanvasRenderingContext2D) => void) {
  const c = new OffscreenCanvas(w, h);
  draw(c.getContext('2d')!);
  return createImageBitmap(c);
}

/**
 * A 100×100 stage on a blue background with two backdrops (left half green; all yellow) and a
 * 20×20 sprite at the centre: a red frame around a see-through middle.
 */
async function setup() {
  const el = document.createElement('div');
  el.style.cssText = 'width:100px;height:100px;position:absolute;left:0;top:0';
  document.body.appendChild(el);
  const r = await PixiRenderer.create({
    container: el,
    preference: 'webgl',
    preserveDrawingBuffer: true,
    letterbox: '#000',
  });
  renderers.push(r);
  const stage = normalizeStage({
    width: 100,
    height: 100,
    background: '#0000ff',
    scaling: { mode: 'fit', filter: 'pixel' },
  });
  const { textures, costumes } = texturesFromCostumes(
    [
      {
        id: 'half',
        name: 'half',
        bitmap: await image(100, 100, (g) => {
          g.fillStyle = '#00ff00';
          g.fillRect(0, 0, 50, 100);
        }),
        pixelArt: true,
        center: [50, 50],
      },
      {
        id: 'sun',
        name: 'sun',
        bitmap: await image(100, 100, (g) => {
          g.fillStyle = '#ffff00';
          g.fillRect(0, 0, 100, 100);
        }),
        pixelArt: true,
        center: [50, 50],
      },
      {
        id: 'ring',
        name: 'ring',
        bitmap: await image(20, 20, (g) => {
          g.fillStyle = '#ff0000';
          g.fillRect(0, 0, 20, 20);
          g.clearRect(4, 4, 12, 12);
        }),
        pixelArt: true,
        center: [10, 10],
      },
    ],
    true,
  );
  r.setTextures(textures);
  const world = new World({
    stage,
    sprites: [
      {
        id: 's',
        name: 'S',
        x: 0,
        y: 0,
        direction: 90,
        size: 100,
        visible: true,
        layer: 0,
        costumes: ['ring'],
        costume: 1,
      },
    ],
    backdrops: ['half', 'sun'],
    backdrop: 1,
    costumes,
  });
  return { r, world, b: createBuiltins(world), S: world.all[0]! };
}

function pixel(r: PixiRenderer, x: number, y: number): [number, number, number] {
  const res = r.app.canvas.width / 100;
  const out = document.createElement('canvas');
  out.width = r.app.canvas.width;
  out.height = r.app.canvas.height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(r.app.canvas, 0, 0);
  const d = ctx.getImageData(Math.floor(x * res), Math.floor(y * res), 1, 1).data;
  return [d[0]!, d[1]!, d[2]!];
}

describe('backdrops and distortion effects', () => {
  it('draws the backdrop over the background colour, and switches it', async () => {
    const { r, world, b } = await setup();
    r.render(world);
    expect(pixel(r, 10, 10)).toEqual([0, 255, 0]);
    // Where the backdrop is see-through, the background colour shows.
    expect(pixel(r, 90, 10)).toEqual([0, 0, 255]);
    b.next_backdrop();
    r.render(world);
    expect(pixel(r, 90, 10)).toEqual([255, 255, 0]);
  });

  it('draws mosaic as touching sees it: the frame repeats into the middle', async () => {
    const { r, world, b, S } = await setup();
    b.next_backdrop();
    r.render(world);
    // The ring's middle is see-through: the backdrop shows at the stage centre.
    expect(pixel(r, 50, 50)).toEqual([255, 255, 0]);
    b.set_effect(S, 'mosaic', 10);
    r.render(world);
    // Two copies a side: the centre now lands on a copy's frame.
    expect(pixel(r, 50, 50)).toEqual([255, 0, 0]);
    expect(b.sprite_at(0, 0)).toBe('S');
  });

  it('stamps the costume with its effects', async () => {
    const { r, world, b, S } = await setup();
    b.next_backdrop();
    // Brightness 100 turns the red frame white; mosaic fills the middle with frame.
    b.set_effect(S, 'brightness', 100);
    b.set_effect(S, 'mosaic', 10);
    b.stamp(S);
    S.moveTo(-40, -40);
    r.render(world);
    expect(pixel(r, 50, 50)).toEqual([255, 255, 255]);
    expect(pixel(r, 41, 41)).toEqual([255, 255, 255]);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { normalizeStage, type StageSettings } from '@stitch/cart';
import { createBuiltins } from '../core/builtins';
import { World } from '../core/world';
import { PixiRenderer } from './stage';
import { texturesFromCostumes } from './textures';

const renderers: PixiRenderer[] = [];
afterEach(() => {
  for (const r of renderers.splice(0)) r.destroy();
  document.body.innerHTML = '';
});

/** A stage the given size on screen, with one 10×10 red sprite at (sx, sy), on a blue backdrop. */
async function setup(stage: StageSettings, view: [number, number], sprite: [number, number]) {
  const el = document.createElement('div');
  el.style.cssText = `width:${view[0]}px;height:${view[1]}px;position:absolute;left:0;top:0`;
  document.body.appendChild(el);
  const r = await PixiRenderer.create({
    container: el,
    preference: 'webgl',
    preserveDrawingBuffer: true,
    letterbox: '#000',
  });
  renderers.push(r);
  const src = new OffscreenCanvas(10, 10);
  const g = src.getContext('2d')!;
  g.fillStyle = '#ff0000';
  g.fillRect(0, 0, 10, 10);
  const { textures, costumes } = texturesFromCostumes(
    [
      {
        id: 'red',
        name: 'red',
        bitmap: await createImageBitmap(src),
        pixelArt: true,
        center: [5, 5],
      },
    ],
    stage.scaling.filter === 'pixel',
  );
  r.setTextures(textures);
  const world = new World({
    stage: { ...stage, background: '#0000ff' },
    sprites: [
      {
        id: 's',
        name: 'S',
        x: sprite[0],
        y: sprite[1],
        direction: 90,
        size: 100,
        visible: true,
        layer: 0,
        costumes: ['red'],
        costume: 1,
      },
    ],
    costumes,
  });
  const b = createBuiltins(world);
  return { r, world, b, S: world.all[0]! };
}

/** RGB at a canvas pixel (device pixels). */
function pixel(r: PixiRenderer, x: number, y: number): [number, number, number] {
  const out = document.createElement('canvas');
  out.width = r.app.canvas.width;
  out.height = r.app.canvas.height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(r.app.canvas, 0, 0);
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0]!, d[1]!, d[2]!];
}

describe('pen layer', () => {
  it('draws under sprites and over the backdrop, and clears', async () => {
    const stage = normalizeStage({ width: 100, height: 100 });
    const { r, world, b, S } = await setup(stage, [100, 100], [0, 0]);
    b.set_pen_color(S, '#00ff00');
    b.fill_rect(S, -20, -20, 20, 20);
    r.render(world);
    const res = r.app.canvas.width / 100;
    // Centre: the red sprite covers the green pen.
    expect(pixel(r, 50 * res, 50 * res)).toEqual([255, 0, 0]);
    // Outside the sprite but inside the rectangle: pen green.
    expect(pixel(r, 35 * res, 50 * res)).toEqual([0, 255, 0]);
    // Outside both: blue backdrop.
    expect(pixel(r, 10 * res, 10 * res)).toEqual([0, 0, 255]);
    b.clear_pen();
    r.render(world);
    expect(pixel(r, 35 * res, 50 * res)).toEqual([0, 0, 255]);
  });

  it('stays crisp at whole-number pixel scaling, and stamps the costume', async () => {
    const stage = normalizeStage({
      width: 32,
      height: 32,
      origin: 'top-left',
      yAxis: 'down',
      scaling: { mode: 'integer', filter: 'pixel' },
    });
    const { r, world, b, S } = await setup(stage, [128, 128], [100, 100]);
    b.set_pen_color(S, '#00ff00');
    b.fill_rect(S, 4, 4, 5, 5);
    S.moveTo(20, 20);
    b.stamp(S);
    S.moveTo(100, 100);
    r.render(world);
    const k = r.app.canvas.width / 32; // device pixels per stage pixel
    // The one-pixel square fills a whole k×k block with no blur at its edges.
    expect(pixel(r, 4 * k, 4 * k)).toEqual([0, 255, 0]);
    expect(pixel(r, 5 * k - 1, 5 * k - 1)).toEqual([0, 255, 0]);
    expect(pixel(r, 5 * k, 5 * k)).toEqual([0, 0, 255]);
    expect(pixel(r, 3 * k + k - 1, 4 * k)).toEqual([0, 0, 255]);
    // The stamp stays where the sprite was.
    expect(pixel(r, 20 * k, 20 * k)).toEqual([255, 0, 0]);
  });
});

describe('effects and monitors', () => {
  it('ghost blends the sprite with what is under it', async () => {
    const stage = normalizeStage({ width: 100, height: 100 });
    const { r, world, b, S } = await setup(stage, [100, 100], [0, 0]);
    b.set_effect(S, 'ghost', 50);
    r.render(world);
    const res = r.app.canvas.width / 100;
    const [red, , blue] = pixel(r, 50 * res, 50 * res);
    expect(red).toBeGreaterThan(110);
    expect(red).toBeLessThan(145);
    expect(blue).toBeGreaterThan(110);
  });

  it('draws watch monitors over the stage', async () => {
    const stage = normalizeStage({ width: 100, height: 100 });
    const { r, world, b } = await setup(stage, [100, 100], [0, 0]);
    r.render(world);
    const res = r.app.canvas.width / 100;
    expect(pixel(r, 3 * res, 3 * res)).toEqual([0, 0, 255]);
    b.watch('hp', 3);
    r.render(world);
    expect(pixel(r, 3 * res, 3 * res)).not.toEqual([0, 0, 255]);
  });
});

describe('colour effects', () => {
  it('brightness and colour render, and clearing them restores the costume', async () => {
    const stage = normalizeStage({ width: 100, height: 100 });
    const { r, world, b, S } = await setup(stage, [100, 100], [0, 0]);
    const res = r.app.canvas.width / 100;
    b.set_effect(S, 'brightness', 80);
    r.render(world);
    const [, green] = pixel(r, 50 * res, 50 * res);
    // Red brightened towards white: green and blue rise.
    expect(green).toBeGreaterThan(150);
    b.clear_effects(S);
    r.render(world);
    expect(pixel(r, 50 * res, 50 * res)).toEqual([255, 0, 0]);
    b.set_effect(S, 'color', 100);
    r.render(world);
    expect(pixel(r, 50 * res, 50 * res)).not.toEqual([255, 0, 0]);
  });
});

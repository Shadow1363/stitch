import { afterEach, describe, expect, it } from 'vitest';
import { normalizeStage, type StageSettings } from '@stitch/cart';
import { World } from '../core/world';
import { PixiRenderer } from './stage';
import { texturesFromCostumes } from './textures';

const renderers: PixiRenderer[] = [];
afterEach(() => {
  for (const r of renderers.splice(0)) r.destroy();
  document.body.innerHTML = '';
});

/** Renders one 10x10 red sprite at cart (x, y) and returns the red pixels' bounding box. */
async function redBox(
  stage: StageSettings,
  x: number,
  y: number,
  pixelArt = false,
  withMap = false,
  scroll?: { x: number; y: number },
) {
  const el = document.createElement('div');
  el.style.cssText = `width:${stage.width}px;height:${stage.height}px;position:absolute;left:0;top:0`;
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
    [{ id: 'red', name: 'red', bitmap: await createImageBitmap(src), pixelArt, center: [5, 5] }],
    false,
  );
  r.setTextures(textures);
  // As a tileset, the 10x10 red image is one 10px tile.
  const map = withMap
    ? {
        tileset: 'red',
        tileSize: 10,
        width: 4,
        height: 3,
        cells: new Uint16Array([0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]),
      }
    : undefined;
  const world = new World({
    stage: { ...stage, background: '#0000ff' },
    sprites: withMap
      ? []
      : [
          {
            id: 's',
            name: 'S',
            x,
            y,
            direction: 90,
            size: 100,
            visible: true,
            layer: 0,
            costumes: ['red'],
            costume: 1,
          },
        ],
    costumes,
    ...(map ? { map } : {}),
  });
  if (scroll) world.map!.scroll = scroll;
  r.render(world);

  const canvas = r.app.canvas;
  const res = canvas.width / stage.width;
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, out.width, out.height);
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4;
      // Fully red pixels only, so filtering at the edges can't blur the measurement.
      if (data[i]! > 250 && data[i + 1]! < 5 && data[i + 2]! < 5) {
        left = Math.min(left, px);
        right = Math.max(right, px);
        top = Math.min(top, py);
        bottom = Math.max(bottom, py);
      }
    }
  }
  return {
    left: left / res,
    top: top / res,
    right: (right + 1) / res,
    bottom: (bottom + 1) / res,
    cx: (left + right + 1) / 2 / res,
    cy: (top + bottom + 1) / 2 / res,
  };
}

describe('stage settings render in the right place', () => {
  // Expected screen positions are computed by hand here, not through space.ts.
  it('Scratch defaults: 480x360, centre origin, y up', async () => {
    const b = await redBox(normalizeStage({}), 100, 50, true);
    expect([b.cx, b.cy]).toEqual([240 + 100, 180 - 50]);
  });

  it('320x240, top-left origin, y down', async () => {
    const b = await redBox(
      normalizeStage({ width: 320, height: 240, origin: 'top-left', yAxis: 'down' }),
      100,
      50,
      true,
    );
    expect([b.cx, b.cy]).toEqual([100, 50]);
  });

  it('480x360, centre origin, y down', async () => {
    const b = await redBox(normalizeStage({ yAxis: 'down' }), 100, 50, true);
    expect([b.cx, b.cy]).toEqual([240 + 100, 180 + 50]);
  });

  it('pixel-art sprites at fractional positions land on whole pixels', async () => {
    const b = await redBox(normalizeStage({}), 10.4, -3.6, true);
    // centre 250.4 -> top-left 245.4 -> snapped to 245; y: 183.6 -> 178.6 -> 179
    expect(b).toMatchObject({ left: 245, right: 255, top: 179, bottom: 189 });
  });

  it('draws the tile map from the stage top-left, whatever the origin', async () => {
    for (const stage of [
      normalizeStage({}),
      normalizeStage({ origin: 'top-left', yAxis: 'down' }),
    ]) {
      const b = await redBox(stage, 0, 0, true, true);
      expect(b).toMatchObject({ left: 20, top: 10, right: 30, bottom: 20 });
    }
  });

  it('scrolls the tile map with scroll_map, in whole pixels for pixel art', async () => {
    const smooth = await redBox(normalizeStage({}), 0, 0, true, true, { x: 15, y: 5 });
    expect(smooth).toMatchObject({ left: 5, top: 5, right: 15, bottom: 15 });
    const pixel = normalizeStage({ scaling: { mode: 'fit', filter: 'pixel' } });
    const snapped = await redBox(pixel, 0, 0, true, true, { x: 14.6, y: 4.4 });
    expect(snapped).toMatchObject({ left: 5, top: 6, right: 15, bottom: 16 });
  });

  it('clips sprites that are off-stage instead of drawing them in the letterbox', async () => {
    const b = await redBox(normalizeStage({}), 400, 0, true);
    expect(b.left).toBe(Infinity);
  });
});

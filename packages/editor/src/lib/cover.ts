import { decodeTiles, type Cart } from '@stitch/cart';
import { displayTransform, World, type CostumeInfo } from '@stitch/runtime';
import type { CostumeImage } from '@stitch/runtime/protocol';
import { logoImage } from './logo';

const WIDTH = 480;
const LABEL = 40;
/** The dark theme's chrome, text and muted tokens, fixed so covers don't depend on the theme. */
const COVER = {
  strip: '#11141a',
  title: '#e7eaf0',
  label: '#9ba4b5',
  font: 'Inter, system-ui, sans-serif',
};

/**
 * The cart's cover PNG: the stage's starting frame (map and sprites, positioned by the runtime's
 * own coordinate code) above a title strip with the logo.
 */
export async function renderCover(cart: Cart, images: CostumeImage[]): Promise<Uint8Array> {
  const st = cart.stage;
  const scale = WIDTH / st.width;
  const h = Math.round(st.height * scale);
  const canvas = new OffscreenCanvas(WIDTH, h + LABEL);
  const g = canvas.getContext('2d')!;
  drawFrame(g, cart, images, scale);

  // A cart file looks the same everywhere, so the strip uses fixed brand colours, not the theme.
  g.fillStyle = COVER.strip;
  g.fillRect(0, h, WIDTH, LABEL);
  g.fillStyle = COVER.title;
  g.font = `600 18px ${COVER.font}`;
  g.textBaseline = 'middle';
  g.fillText(cart.meta.title, 14, h + LABEL / 2, WIDTH - 150);
  g.fillStyle = COVER.label;
  g.font = `600 11px ${COVER.font}`;
  g.textAlign = 'right';
  const logo = 22;
  g.fillText('STITCH CART', WIDTH - 14 - logo - 8, h + LABEL / 2);
  g.drawImage(await logoImage(), WIDTH - 14 - logo, h + (LABEL - logo) / 2, logo, logo);
  return pngBytes(canvas);
}

/** A square app icon: the starting frame, fitted and centred on the stage background. */
export async function renderIcon(
  cart: Cart,
  images: CostumeImage[],
  size: number,
): Promise<Uint8Array> {
  const st = cart.stage;
  const canvas = new OffscreenCanvas(size, size);
  const g = canvas.getContext('2d')!;
  g.fillStyle = st.background;
  g.fillRect(0, 0, size, size);
  const scale = size / Math.max(st.width, st.height);
  g.translate((size - st.width * scale) / 2, (size - st.height * scale) / 2);
  drawFrame(g, cart, images, scale);
  return pngBytes(canvas);
}

async function pngBytes(canvas: OffscreenCanvas): Promise<Uint8Array> {
  return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
}

/** The stage's starting frame at `scale`, from the origin of `g`. */
function drawFrame(
  g: OffscreenCanvasRenderingContext2D,
  cart: Cart,
  images: CostumeImage[],
  scale: number,
): void {
  const st = cart.stage;
  const w = st.width * scale;
  const h = st.height * scale;
  g.fillStyle = st.background;
  g.fillRect(0, 0, w, h);

  const byId = new Map(images.map((i) => [i.id, i]));
  const costumes: Record<string, CostumeInfo> = {};
  for (const i of images)
    costumes[i.id] = {
      id: i.id,
      name: i.name,
      width: i.bitmap.width,
      height: i.bitmap.height,
      center: i.center,
      pixelArt: i.pixelArt,
    };
  const world = new World({
    stage: st,
    sprites: cart.sprites,
    costumes,
    ...(cart.map
      ? {
          map: {
            tileset: cart.map.tileset,
            tileSize: cart.map.tileSize,
            width: cart.map.width,
            height: cart.map.height,
            cells: decodeTiles(cart.map),
          },
        }
      : {}),
  });

  g.save();
  g.beginPath();
  g.rect(0, 0, w, h);
  g.clip();
  g.scale(scale, scale);
  const m = world.map;
  const tiles = m && byId.get(m.tileset)?.bitmap;
  if (m && tiles) {
    g.imageSmoothingEnabled = false;
    const cols = Math.floor(tiles.width / m.tileSize);
    m.cells.forEach((v, i) => {
      if (!v || !cols) return;
      const t = v - 1;
      g.drawImage(
        tiles,
        (t % cols) * m.tileSize,
        Math.floor(t / cols) * m.tileSize,
        m.tileSize,
        m.tileSize,
        (i % m.width) * m.tileSize,
        Math.floor(i / m.width) * m.tileSize,
        m.tileSize,
        m.tileSize,
      );
    });
  }
  for (const s of world.sprites) {
    const c = s.currentCostume;
    const img = c && byId.get(c.id)?.bitmap;
    if (!s.visible || !c || !img) continue;
    const t = displayTransform(s, c, world.space, c.pixelArt || st.scaling.filter === 'pixel');
    g.save();
    g.imageSmoothingEnabled = !(c.pixelArt || st.scaling.filter === 'pixel');
    g.translate(t.x, t.y);
    g.rotate(t.rotation);
    g.scale(t.scale, t.scale);
    g.drawImage(img, -t.anchorX * c.width, -t.anchorY * c.height);
    g.restore();
  }
  g.restore();
}

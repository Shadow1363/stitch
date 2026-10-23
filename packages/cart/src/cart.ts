import { migrateProject, type Project } from '@stitch/ir';
import { normalizeStage, type StageSettings } from './stage-settings';

export const CART_FORMAT = 'stitch-cart' as const;
export const CART_VERSION = 1 as const;

/** Initial state of one sprite. Positions are cart-space floats. */
export interface SpriteInit {
  /** Matches `Project.sprites[].id`. */
  id: string;
  name: string;
  x: number;
  y: number;
  direction: number;
  size: number;
  visible: boolean;
  /** Draw order; higher is in front. */
  layer: number;
  /** Asset ids, in costume order. */
  costumes: string[];
  /** 1-based, like `costume_number`. */
  costume: number;
}

export interface ImageAsset {
  type: 'image/png';
  /** data: URL, or a URL relative to the cart. */
  data: string;
  /** Nearest-neighbour filtering and whole-pixel placement. */
  pixelArt: boolean;
  /** Rotation centre in costume pixels from the top-left. */
  center: [number, number];
  name: string;
}

export interface CartV1 {
  format: typeof CART_FORMAT;
  version: typeof CART_VERSION;
  meta: { title: string; author?: string };
  stage: StageSettings;
  project: Project;
  sprites: SpriteInit[];
  assets: Record<string, ImageAsset>;
}

export type Cart = CartV1;

/** Validates the envelope, migrates older versions, and fills defaults. */
export function normalizeCart(input: unknown): Cart {
  if (!input || typeof input !== 'object') throw new Error('cart: expected an object');
  const c = input as Record<string, unknown>;
  if (c.format !== CART_FORMAT) throw new Error(`cart: format must be "${CART_FORMAT}"`);
  if (typeof c.version !== 'number') throw new Error('cart: missing version');
  if (c.version > CART_VERSION)
    throw new Error(
      `cart: version ${c.version} is newer than this build supports (${CART_VERSION})`,
    );
  // No older versions exist yet; add stepwise migrations here when CART_VERSION is bumped.
  const meta = (c.meta ?? {}) as { title?: unknown; author?: unknown };
  return {
    format: CART_FORMAT,
    version: CART_VERSION,
    meta: {
      title: typeof meta.title === 'string' ? meta.title : 'Untitled',
      ...(typeof meta.author === 'string' ? { author: meta.author } : {}),
    },
    stage: normalizeStage(c.stage),
    project: migrateProject(c.project),
    sprites: Array.isArray(c.sprites)
      ? (c.sprites as Partial<SpriteInit>[]).map(normalizeSprite)
      : [],
    assets: (c.assets ?? {}) as Record<string, ImageAsset>,
  };
}

function normalizeSprite(s: Partial<SpriteInit>, i: number): SpriteInit {
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    id: s.id ?? `s${i + 1}`,
    name: s.name ?? `Sprite${i + 1}`,
    x: num(s.x, 0),
    y: num(s.y, 0),
    direction: num(s.direction, 90),
    size: num(s.size, 100),
    visible: s.visible ?? true,
    layer: num(s.layer, i),
    costumes: s.costumes ?? [],
    costume: num(s.costume, 1),
  };
}

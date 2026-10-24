import { migrateProject, validateManifest, type ExtensionManifest, type Project } from '@stitch/ir';
import type { TileMap } from './map';
import { emptyMusic, normalizeMusic, type Music } from './music';
import { DEFAULT_PALETTE } from './palette';
import type { PixelLayer } from './pixel';
import { normalizeSfx, type Sound } from './sfx';
import { normalizeStage, type StageSettings } from './stage-settings';

export const CART_FORMAT = 'stitch-cart' as const;
export const CART_VERSION = 5 as const;

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

interface AssetBase {
  name: string;
  /** Rotation centre in costume pixels from the top-left. */
  center: [number, number];
}

/** An imported bitmap. */
export interface PngAsset extends AssetBase {
  kind: 'png';
  /** data: URL, or a URL relative to the cart. */
  data: string;
  /** Nearest-neighbour filtering and whole-pixel placement. */
  pixelArt: boolean;
}

/** Editable pixel art in the cart palette. Always drawn as pixel art. */
export interface PixelAsset extends AssetBase {
  kind: 'pixel';
  width: number;
  height: number;
  layers: PixelLayer[];
}

/** Editable vector art. */
export interface SvgAsset extends AssetBase {
  kind: 'svg';
  svg: string;
}

export type Asset = PngAsset | PixelAsset | SvgAsset;

/** Per-file editor state that isn't part of the program. */
export interface FileEditorState {
  /** Block positions by node id. */
  layout: Record<string, { x: number; y: number }>;
  /** Loose blocks (Blockly JSON) kept on the workspace. */
  loose: unknown[];
}

/**
 * An extension carried by the cart, so the cart runs anywhere without fetching it. The editor
 * reads only the manifest; `code` runs inside the sandboxed stage.
 */
export interface CartExtension {
  manifest: ExtensionManifest;
  /** Script body, called as `new Function('stitch', code)(api)` in the stage. */
  code: string;
}

export interface CartV4 {
  format: typeof CART_FORMAT;
  version: typeof CART_VERSION;
  meta: { title: string; author?: string };
  stage: StageSettings;
  project: Project;
  sprites: SpriteInit[];
  /** Colours for palette indices 1..n; index 0 is transparent. */
  palette: string[];
  assets: Record<string, Asset>;
  map?: TileMap;
  /** Sound effects by id; scripts refer to them by name. */
  sounds: Record<string, Sound>;
  music: Music;
  /** In load order. */
  extensions: CartExtension[];
  /** Keyed by file id ("$stage" or a sprite id). Not needed to run the cart. */
  editor?: { files: Record<string, FileEditorState> };
}

export type Cart = CartV4;

/** v1 assets were PNG-only and had no `kind`. */
interface ImageAssetV1 {
  type: 'image/png';
  data: string;
  pixelArt: boolean;
  center: [number, number];
  name: string;
}

/** Validates the envelope, migrates older versions, and fills defaults. */
export function normalizeCart(input: unknown): Cart {
  if (!input || typeof input !== 'object') throw new Error('cart: expected an object');
  let c = input as Record<string, unknown>;
  if (c.format !== CART_FORMAT) throw new Error(`cart: format must be "${CART_FORMAT}"`);
  if (typeof c.version !== 'number') throw new Error('cart: missing version');
  if (c.version > CART_VERSION)
    throw new Error(
      `cart: version ${c.version} is newer than this build supports (${CART_VERSION})`,
    );
  if (c.version === 1) c = migrateV1(c);
  if (c.version === 2) c = { ...c, version: 3, sounds: {}, music: emptyMusic() };
  if (c.version === 3) c = { ...c, version: 4, extensions: [] };
  // v5 added stage.cloneLimit, which normalizeStage fills in.
  if (c.version === 4) c = { ...c, version: 5 };
  const meta = (c.meta ?? {}) as { title?: unknown; author?: unknown };
  const cart: Cart = {
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
    palette:
      Array.isArray(c.palette) && c.palette.every((p) => typeof p === 'string')
        ? (c.palette as string[])
        : DEFAULT_PALETTE.slice(),
    assets: (c.assets ?? {}) as Record<string, Asset>,
    sounds: normalizeSounds(c.sounds),
    music: normalizeMusic(c.music),
    extensions: normalizeExtensions(c.extensions),
  };
  if (c.map && typeof c.map === 'object') cart.map = c.map as TileMap;
  if (c.editor && typeof c.editor === 'object') cart.editor = c.editor as Cart['editor'];
  return cart;
}

/** Keeps extensions whose manifest validates and whose id is not already taken. */
function normalizeExtensions(input: unknown): CartExtension[] {
  const out: CartExtension[] = [];
  if (!Array.isArray(input)) return out;
  for (const e of input as { manifest?: unknown; code?: unknown }[]) {
    const r = validateManifest(e?.manifest);
    if (!r.ok || typeof e.code !== 'string') continue;
    if (out.some((x) => x.manifest.id === r.manifest.id)) continue;
    out.push({ manifest: r.manifest, code: e.code });
  }
  return out;
}

function normalizeSounds(input: unknown): Record<string, Sound> {
  const out: Record<string, Sound> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [id, s] of Object.entries(input as Record<string, Partial<Sound>>))
    out[id] = {
      kind: 'sfx',
      name: typeof s.name === 'string' ? s.name : id,
      params: normalizeSfx(s.params),
    };
  return out;
}

function migrateV1(c: Record<string, unknown>): Record<string, unknown> {
  const assets: Record<string, Asset> = {};
  for (const [id, a] of Object.entries((c.assets ?? {}) as Record<string, ImageAssetV1>))
    assets[id] = {
      kind: 'png',
      name: a.name,
      data: a.data,
      pixelArt: a.pixelArt,
      center: a.center,
    };
  return { ...c, version: 2, assets, palette: DEFAULT_PALETTE.slice() };
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

/** Pixel-art assets, and PNGs marked as pixel art, draw with nearest-neighbour filtering. */
export function isPixelArt(a: Asset): boolean {
  return a.kind === 'pixel' || (a.kind === 'png' && a.pixelArt);
}

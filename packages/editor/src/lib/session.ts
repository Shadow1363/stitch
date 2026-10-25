import type { BlockJson } from '@stitch/blocks';
import {
  blankImage,
  CART_FORMAT,
  CART_VERSION,
  DEFAULT_PALETTE,
  emptyMusic,
  encodeLayers,
  normalizeMusic,
  normalizeStage,
  type Asset,
  type Cart,
  type CartExtension,
  type Music,
  type Sound,
  type SpriteInit,
  type StageSettings,
  type TileMap,
} from '@stitch/cart';
import { createCatalog, IR_VERSION, type CartNames, type Catalog } from '@stitch/ir';
import { SourceDoc } from './doc';

export const STAGE_FILE = '$stage';

/**
 * Everything being edited: one cart. Plain mutable data; the UI bumps a version counter after
 * changing it. `toCart()` / `fromCart()` are the only ways in and out of the saved format.
 */
export class Session {
  meta: Cart['meta'];
  stage: StageSettings;
  sprites: SpriteInit[];
  /** Asset ids of the stage's backdrops, in order. */
  backdrops: string[];
  /** 1-based backdrop shown at Run. */
  backdrop: number;
  palette: string[];
  assets: Record<string, Asset>;
  map: TileMap | undefined;
  sounds: Record<string, Sound>;
  music: Music;
  /** Replaced, never mutated in place, so `catalog` can cache on identity. */
  extensions: CartExtension[];
  docs: SourceDoc[];
  private cached: { from: CartExtension[]; catalog: Catalog } | undefined;

  private constructor(
    c: Omit<Cart, 'format' | 'version' | 'project' | 'editor'> & { docs: SourceDoc[] },
  ) {
    this.meta = c.meta;
    this.stage = c.stage;
    this.sprites = c.sprites;
    this.backdrops = c.backdrops;
    this.backdrop = c.backdrop;
    this.palette = c.palette;
    this.assets = c.assets;
    this.map = c.map;
    this.sounds = c.sounds;
    this.music = c.music;
    this.extensions = c.extensions;
    this.docs = c.docs;
  }

  /** Core builtins plus this cart's extension blocks. Same object until extensions change. */
  get catalog(): Catalog {
    if (this.cached?.from !== this.extensions)
      this.cached = {
        from: this.extensions,
        catalog: createCatalog(this.extensions.map((e) => e.manifest)),
      };
    return this.cached.catalog;
  }

  /** Adds an extension, replacing one with the same id (an update). */
  addExtension(ext: CartExtension): void {
    const i = this.extensions.findIndex((e) => e.manifest.id === ext.manifest.id);
    this.extensions =
      i < 0 ? [...this.extensions, ext] : this.extensions.map((e, j) => (j === i ? ext : e));
  }

  removeExtension(id: string): void {
    this.extensions = this.extensions.filter((e) => e.manifest.id !== id);
  }

  static fromCart(cart: Cart): Session {
    const files = cart.editor?.files ?? {};
    const state = (id: string) => {
      const f = files[id];
      return f ? { layout: f.layout, loose: f.loose as BlockJson[] } : undefined;
    };
    const docs = [SourceDoc.fromModule(STAGE_FILE, 'Stage', cart.project.stage, state(STAGE_FILE))];
    for (const s of cart.sprites) {
      const m = cart.project.sprites.find((p) => p.id === s.id)?.module ?? { items: [] };
      docs.push(SourceDoc.fromModule(s.id, s.name, m, state(s.id)));
    }
    return new Session({
      ...structuredClone({
        meta: cart.meta,
        stage: cart.stage,
        sprites: cart.sprites,
        backdrops: cart.backdrops,
        backdrop: cart.backdrop,
        palette: cart.palette,
        assets: cart.assets,
        sounds: cart.sounds,
        music: cart.music,
        extensions: cart.extensions,
      }),
      map: cart.map ? { ...cart.map } : undefined,
      docs,
    });
  }

  /** A cart from source text per file (used for the built-in sample). */
  static fromSources(
    parts: Omit<
      Cart,
      | 'format'
      | 'version'
      | 'project'
      | 'editor'
      | 'sounds'
      | 'music'
      | 'extensions'
      | 'backdrops'
      | 'backdrop'
    > &
      Partial<Pick<Cart, 'sounds' | 'music' | 'extensions' | 'backdrops' | 'backdrop'>>,
    sources: Record<string, string>,
  ): Session {
    const docs = [new SourceDoc(STAGE_FILE, 'Stage', sources[STAGE_FILE] ?? STAGE_TEMPLATE)];
    for (const s of parts.sprites) docs.push(new SourceDoc(s.id, s.name, sources[s.id] ?? ''));
    return new Session({
      ...structuredClone({
        ...parts,
        map: undefined,
        sounds: parts.sounds ?? {},
        extensions: parts.extensions ?? [],
        backdrops: parts.backdrops ?? [],
        backdrop: parts.backdrop ?? 1,
      }),
      music: normalizeMusic(structuredClone(parts.music)),
      map: parts.map ? { ...parts.map } : undefined,
      docs,
    });
  }

  static empty(): Session {
    const s = new Session({
      meta: { title: 'Untitled' },
      stage: normalizeStage({}),
      sprites: [],
      backdrops: [],
      backdrop: 1,
      palette: DEFAULT_PALETTE.slice(),
      assets: {},
      map: undefined,
      sounds: {},
      music: emptyMusic(),
      extensions: [],
      docs: [new SourceDoc(STAGE_FILE, 'Stage', STAGE_TEMPLATE)],
    });
    s.addSprite();
    return s;
  }

  toCart(): Cart {
    const stageDoc = this.doc(STAGE_FILE);
    const files: NonNullable<Cart['editor']>['files'] = {};
    for (const d of this.docs)
      files[d.id] = { layout: { ...d.layout }, loose: structuredClone(d.loose) };
    const cart: Cart = {
      format: CART_FORMAT,
      version: CART_VERSION,
      meta: { ...this.meta },
      stage: structuredClone(this.stage),
      project: {
        irVersion: IR_VERSION,
        stage: structuredClone(stageDoc?.module ?? { items: [] }),
        sprites: this.sprites.map((s) => ({
          id: s.id,
          name: s.name,
          module: structuredClone(this.doc(s.id)?.module ?? { items: [] }),
        })),
      },
      sprites: structuredClone(this.sprites),
      backdrops: this.backdrops.slice(),
      backdrop: this.backdrop,
      palette: this.palette.slice(),
      assets: structuredClone(this.assets),
      sounds: structuredClone(this.sounds),
      music: structuredClone(this.music),
      extensions: structuredClone(this.extensions),
      editor: { files },
    };
    if (this.map) cart.map = { ...this.map };
    return cart;
  }

  /** Names that scripts refer to in strings: sprites, each sprite's costumes, sounds, songs. */
  names(): CartNames {
    const assetName = (id: string) => this.assets[id]?.name;
    return {
      sprites: this.sprites.map((s) => s.name),
      costumes: Object.fromEntries(
        this.sprites.map((s) => [s.name, s.costumes.map(assetName).filter((n) => n !== undefined)]),
      ),
      sounds: Object.values(this.sounds).map((s) => s.name),
      backdrops: this.backdrops.map(assetName).filter((n) => n !== undefined),
      songs: Object.values(this.music.songs).map((s) => s.name),
    };
  }

  doc(id: string): SourceDoc | undefined {
    return this.docs.find((d) => d.id === id);
  }

  sprite(id: string): SpriteInit | undefined {
    return this.sprites.find((s) => s.id === id);
  }

  /** A fresh id that no sprite, doc or asset uses. */
  newId(prefix: string): string {
    const taken = new Set([
      ...this.sprites.map((s) => s.id),
      ...Object.keys(this.assets),
      ...Object.keys(this.sounds),
      ...Object.keys(this.music.instruments),
      ...Object.keys(this.music.patterns),
      ...Object.keys(this.music.songs),
      ...this.docs.map((d) => d.id),
    ]);
    for (let i = 1; ; i++) if (!taken.has(`${prefix}${i}`)) return `${prefix}${i}`;
  }

  addAsset(asset: Asset, prefix = 'a'): string {
    const id = this.newId(prefix);
    this.assets[id] = asset;
    return id;
  }

  /** Adds a sprite with a starter pixel-art costume and an empty script file. */
  addSprite(name?: string): SpriteInit {
    const id = this.newId('sprite');
    const n =
      name ??
      uniqueName(
        'Sprite',
        this.sprites.map((s) => s.name),
      );
    const costume = this.addAsset(starterCostume(), 'costume');
    const s: SpriteInit = {
      id,
      name: n,
      x: 0,
      y: 0,
      direction: 90,
      size: 200,
      visible: true,
      layer: this.sprites.length,
      costumes: [costume],
      costume: 1,
    };
    this.sprites.push(s);
    this.docs.push(new SourceDoc(id, n, 'on start do\nend\n'));
    return s;
  }

  removeSprite(id: string): void {
    const s = this.sprite(id);
    if (!s) return;
    this.sprites = this.sprites.filter((x) => x.id !== id);
    this.docs = this.docs.filter((d) => d.id !== id);
    for (const a of s.costumes) this.dropAssetIfUnused(a);
  }

  renameSprite(id: string, name: string): void {
    const s = this.sprite(id);
    const d = this.doc(id);
    if (s) s.name = name;
    if (d) d.name = name;
  }

  /** Removes an asset nothing refers to any more (no costume list, not the map tileset). */
  dropAssetIfUnused(id: string): void {
    const used =
      this.sprites.some((s) => s.costumes.includes(id)) ||
      this.backdrops.includes(id) ||
      this.map?.tileset === id;
    if (!used) delete this.assets[id];
  }
}

const STAGE_TEMPLATE = '-- Stage scripts and global variables go here.\n';

export function uniqueName(base: string, taken: string[]): string {
  for (let i = 1; ; i++) if (!taken.includes(`${base}${i}`)) return `${base}${i}`;
}

/** A 16x16 filled circle in palette colour 9, so a new sprite is visible straight away. */
export function starterCostume(): Asset {
  const img = blankImage(16, 16);
  const px = img.layers[0]!.pixels;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) if ((x - 7.5) ** 2 + (y - 7.5) ** 2 < 49) px[y * 16 + x] = 9;
  return {
    kind: 'pixel',
    name: 'costume1',
    width: 16,
    height: 16,
    center: [8, 8],
    layers: encodeLayers(img),
  };
}

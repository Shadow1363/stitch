import {
  Application,
  ColorMatrixFilter,
  Container,
  Graphics,
  Rectangle,
  RenderTexture,
  Sprite as PixiSprite,
  Text,
  Texture,
} from 'pixi.js';
import { stageBounds } from '../core/bounds';
import { ADVANCE, glyph, LINE_HEIGHT, type PenOp } from '../core/pen';
import { LETTERBOX, type Renderer, type RenderView } from '../core/renderer';
import type { Effects, Sprite } from '../core/sprite';
import type { MapState } from '../core/world';
import { displayTransform } from './transform';

/** Adds one line or shape to the batch. */
function drawOp(g: Graphics, op: Exclude<PenOp, { kind: 'clear' | 'stamp' }>) {
  const ink = { color: op.color, alpha: op.alpha };
  if (op.kind === 'line') {
    if (op.x1 === op.x2 && op.y1 === op.y2) g.circle(op.x1, op.y1, op.width / 2).fill(ink);
    else
      g.moveTo(op.x1, op.y1)
        .lineTo(op.x2, op.y2)
        .stroke({ ...ink, width: op.width, cap: 'round' });
    return;
  }
  if (op.kind === 'rect') g.rect(op.x, op.y, op.w, op.h);
  else g.circle(op.x, op.y, op.r);
  if (op.line) g.stroke({ ...ink, width: op.line });
  else g.fill(ink);
}

export type RendererPreference = 'webgpu' | 'webgl';

export interface PixiRendererOptions {
  /** Element the canvas fills; the stage is letterboxed inside it. */
  container: HTMLElement;
  preference?: RendererPreference;
  /** Needed only for pixel readback in tests. */
  preserveDrawingBuffer?: boolean;
  letterbox?: string;
}

interface Bubble {
  root: Container;
  bg: Graphics;
  label: Text;
  text: string;
  thinking: boolean;
}

/** Pen texture resolution for smooth stages, so lines stay sharp when the stage scales up. */
const SMOOTH_PEN_RESOLUTION = Math.min(4, Math.ceil((globalThis.devicePixelRatio || 1) * 2));

/** Draws a World with PixiJS v8. Rendering is driven by the caller (no Pixi ticker). */
export class PixiRenderer implements Renderer {
  readonly app = new Application();
  private world = new Container();
  private backdrop = new Graphics();
  /** Clips sprites to the stage: with no implicit fencing they may sit off-stage. */
  private clip = new Graphics();
  /** Map and sprites, clipped to the stage together. */
  private content = new Container();
  private mapLayer = new Container();
  private mapSprites: (PixiSprite | undefined)[] = [];
  private tileTextures: Texture[] = [];
  private mapFor: MapState | undefined;
  /** Pen drawing: a texture between the map and the sprites (Scratch's pen layer). */
  private penTexture: RenderTexture | undefined;
  private penSprite = new PixiSprite();
  private penKey = '';
  private penBatch = new Graphics();
  private watchLayer = new Graphics();
  private watchKey = '';
  private filters = new Map<Sprite, ColorMatrixFilter>();
  private layer = new Container();
  private bubbles = new Container();
  private pool = new Map<Sprite, PixiSprite>();
  private bubblePool = new Map<Sprite, Bubble>();
  private textures = new Map<string, Texture>();
  private backdropKey = '';

  private constructor(private opts: PixiRendererOptions) {}

  static async create(opts: PixiRendererOptions): Promise<PixiRenderer> {
    const r = new PixiRenderer(opts);
    await r.app.init({
      resizeTo: opts.container,
      preference: opts.preference ?? 'webgl',
      background: opts.letterbox ?? LETTERBOX,
      autoStart: false,
      sharedTicker: false,
      antialias: false,
      autoDensity: true,
      resolution: globalThis.devicePixelRatio || 1,
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
    });
    opts.container.appendChild(r.app.canvas);
    r.app.stage.addChild(r.world);
    r.world.addChild(r.backdrop, r.clip, r.content, r.bubbles, r.watchLayer);
    r.content.addChild(r.mapLayer, r.penSprite, r.layer);
    r.layer.sortableChildren = true;
    r.content.mask = r.clip;
    return r;
  }

  get name(): string {
    return this.app.renderer.name;
  }

  /** Replaces the costume textures (asset id -> texture). */
  setTextures(textures: Map<string, Texture>): void {
    this.clearSprites();
    this.clearMap();
    for (const t of this.textures.values()) t.destroy(true);
    this.textures = textures;
  }

  render(view: RenderView): void {
    const { space } = view;
    const st = space.settings;
    const fit = space.fit(this.app.screen.width, this.app.screen.height);
    this.world.scale.set(fit.scale);
    this.world.position.set(fit.offX, fit.offY);
    const key = `${st.width}x${st.height}:${st.background}`;
    if (key !== this.backdropKey) {
      this.backdrop.clear().rect(0, 0, st.width, st.height).fill(st.background);
      this.clip.clear().rect(0, 0, st.width, st.height).fill('#fff');
      this.backdropKey = key;
    }

    this.syncMap(view.map);
    this.syncPen(
      view,
      `${st.width}x${st.height}:${st.scaling.filter}`,
      st.scaling.filter === 'pixel',
    );

    const seen = new Set<Sprite>();
    for (const s of view.sprites) {
      if (s.isStage) continue;
      const costume = s.currentCostume;
      const tex = costume && this.textures.get(costume.id);
      let ps = this.pool.get(s);
      if (!tex || !costume) {
        if (ps) ps.visible = false;
        continue;
      }
      if (!ps) {
        ps = new PixiSprite(tex);
        this.pool.set(s, ps);
        this.layer.addChild(ps);
      }
      seen.add(s);
      if (ps.texture !== tex) ps.texture = tex;
      const pixel = st.scaling.filter === 'pixel' || costume.pixelArt;
      const t = displayTransform(s, costume, space, pixel);
      ps.anchor.set(t.anchorX, t.anchorY);
      ps.position.set(t.x, t.y);
      ps.rotation = t.rotation;
      ps.scale.set(t.flip ? -t.scale : t.scale, t.scale);
      ps.visible = s.visible;
      ps.alpha = 1 - s.effects.ghost / 100;
      this.applyEffects(s, ps, s.effects);
      if (ps.zIndex !== s.layer) ps.zIndex = s.layer;
      this.updateBubble(s, view);
    }
    for (const [s, ps] of this.pool) {
      if (seen.has(s)) continue;
      ps.destroy();
      this.pool.delete(s);
      this.filters.get(s)?.destroy();
      this.filters.delete(s);
    }
    for (const [s, b] of this.bubblePool) {
      if (seen.has(s)) continue;
      b.root.destroy({ children: true });
      this.bubblePool.delete(s);
    }
    this.drawWatches(view);
    this.app.render();
  }

  /** Colour and brightness need a filter; it's attached only while either is non-zero. */
  private applyEffects(s: Sprite, ps: PixiSprite, e: Effects) {
    let f = this.filters.get(s);
    // `filters` is undefined on a sprite that never had any.
    const attached = ps.filters?.[0] === f && f !== undefined;
    if (!e.color && !e.brightness) {
      if (attached) ps.filters = [];
      return;
    }
    if (!f) {
      f = new ColorMatrixFilter();
      this.filters.set(s, f);
    }
    f.reset();
    // Scratch: colour 200 is a full turn of hue; brightness adds to every channel.
    if (e.color) f.hue((e.color / 200) * 360, false);
    if (e.brightness) {
      const m = f.matrix;
      const b = e.brightness / 100;
      for (const i of [4, 9, 14]) m[i] = (m[i] ?? 0) + b;
      f.matrix = m;
    }
    if (!attached) ps.filters = [f];
  }

  /** Draws the pen ops since the last frame into the pen texture, in order. */
  private syncPen(view: RenderView, key: string, pixel: boolean) {
    const st = view.space.settings;
    if (key !== this.penKey) {
      this.penTexture?.destroy(true);
      this.penTexture = RenderTexture.create({
        width: st.width,
        height: st.height,
        resolution: pixel ? 1 : SMOOTH_PEN_RESOLUTION,
        scaleMode: pixel ? 'nearest' : 'linear',
        antialias: !pixel,
      });
      this.penSprite.texture = this.penTexture;
      this.penKey = key;
    }
    const ops = view.pen?.take();
    if (!ops?.length || !this.penTexture) return;
    const target = this.penTexture;
    const g = this.penBatch;
    let pending = false;
    const flush = () => {
      if (!pending) return;
      this.app.renderer.render({ container: g, target, clear: false });
      g.clear();
      pending = false;
    };
    for (const op of ops) {
      if (op.kind === 'clear') {
        g.clear();
        pending = false;
        this.app.renderer.render({ container: new Container(), target, clear: true });
      } else if (op.kind === 'stamp') {
        flush();
        this.stamp(op, view, target, pixel);
      } else {
        drawOp(g, op);
        pending = true;
      }
    }
    flush();
  }

  private stamp(
    op: Extract<PenOp, { kind: 'stamp' }>,
    view: RenderView,
    target: RenderTexture,
    pixel: boolean,
  ) {
    const tex = this.textures.get(op.costume);
    if (!tex) return;
    const info = {
      id: op.costume,
      name: '',
      width: tex.width,
      height: tex.height,
      center: op.center,
      pixelArt: pixel,
    };
    const t = displayTransform(op.pose, info, view.space, pixel);
    const ps = new PixiSprite(tex);
    ps.anchor.set(t.anchorX, t.anchorY);
    ps.position.set(t.x, t.y);
    ps.rotation = t.rotation;
    ps.scale.set(t.flip ? -t.scale : t.scale, t.scale);
    ps.alpha = op.alpha;
    this.app.renderer.render({ container: ps, target, clear: false });
    ps.destroy();
  }

  /** `watch` monitors, top-left, in the pixel font so they read the same in every player. */
  private drawWatches(view: RenderView) {
    const w = view.watches;
    const key = w ? [...w].map(([k, v]) => `${k}\u0000${v}`).join('\u0001') : '';
    if (key === this.watchKey) return;
    this.watchKey = key;
    const g = this.watchLayer.clear();
    if (!w?.size) return;
    const k = view.space.width >= 256 ? 2 : 1;
    let y = 2 * k;
    for (const [label, value] of [...w].slice(0, 12)) {
      const text = `${label}: ${value}`.slice(0, 40).toUpperCase();
      const width = (text.length * ADVANCE + 3) * k;
      g.rect(2 * k, y, width, (LINE_HEIGHT + 2) * k).fill({ color: 0x1d2b53, alpha: 0.85 });
      [...text].forEach((ch, i) => {
        const rows = glyph(ch);
        for (let r = 0; r < 5; r++)
          for (let c = 0; c < 3; c++)
            if (rows[r]! & (4 >> c)) g.rect((4 + i * ADVANCE + c) * k, y + (2 + r) * k - k, k, k);
      });
      g.fill({ color: 0xfff1e8 });
      y += (LINE_HEIGHT + 4) * k;
    }
  }

  private updateBubble(s: Sprite, view: RenderView) {
    let b = this.bubblePool.get(s);
    if (!s.sayText || !s.visible) {
      if (b) b.root.visible = false;
      return;
    }
    if (!b) {
      const root = new Container();
      const bg = new Graphics();
      const label = new Text({
        text: '',
        style: {
          fontFamily: 'system-ui, sans-serif',
          fontSize: 14,
          fill: '#222',
          wordWrap: true,
          wordWrapWidth: 160,
        },
      });
      label.position.set(8, 6);
      root.addChild(bg, label);
      this.bubbles.addChild(root);
      b = { root, bg, label, text: '', thinking: false };
      this.bubblePool.set(s, b);
    }
    if (b.text !== s.sayText || b.thinking !== s.thinking) {
      b.text = s.sayText;
      b.thinking = s.thinking;
      b.label.text = s.sayText;
      const w = b.label.width + 16;
      const h = b.label.height + 12;
      // A thought is rounder and trails two small circles instead of pointing.
      b.bg.clear().roundRect(0, 0, w, h, s.thinking ? h / 2 : 8);
      if (s.thinking) b.bg.circle(8, h + 4, 3).circle(3, h + 10, 2);
      b.bg.fill('#fff').stroke({ color: '#999', width: 1.5 });
    }
    b.root.visible = true;
    const r = stageBounds(s, view.space);
    const w = b.label.width + 16;
    const h = b.label.height + 12;
    b.root.position.set(
      Math.min(Math.max(r.right, 0), view.space.width - w),
      Math.max(r.top - h - 4, 0),
    );
  }

  /** Builds the tile layer once per map, then updates only the cells scripts changed. */
  private syncMap(map: MapState | undefined) {
    if (map !== this.mapFor) {
      this.clearMap();
      this.mapFor = map;
      if (!map) return;
      const tex = this.textures.get(map.tileset);
      if (tex) {
        const ts = map.tileSize;
        const cols = Math.floor(tex.width / ts);
        const rows = Math.floor(tex.height / ts);
        for (let y = 0; y < rows; y++)
          for (let x = 0; x < cols; x++)
            this.tileTextures.push(
              new Texture({ source: tex.source, frame: new Rectangle(x * ts, y * ts, ts, ts) }),
            );
      }
      for (let i = 0; i < map.cells.length; i++) this.placeTile(map, i);
      map.dirty.clear();
      return;
    }
    if (!map || !map.dirty.size) return;
    for (const i of map.dirty) this.placeTile(map, i);
    map.dirty.clear();
  }

  private placeTile(map: MapState, i: number) {
    const v = map.cells[i]!;
    const tex = v ? this.tileTextures[v - 1] : undefined;
    let s = this.mapSprites[i];
    if (!tex) {
      if (s) s.visible = false;
      return;
    }
    if (!s) {
      s = new PixiSprite(tex);
      s.position.set((i % map.width) * map.tileSize, Math.floor(i / map.width) * map.tileSize);
      this.mapLayer.addChild(s);
      this.mapSprites[i] = s;
    } else {
      s.texture = tex;
      s.visible = true;
    }
  }

  private clearMap() {
    this.mapLayer.removeChildren().forEach((c) => c.destroy());
    this.mapSprites = [];
    for (const t of this.tileTextures) t.destroy(false);
    this.tileTextures = [];
    this.mapFor = undefined;
  }

  private clearSprites() {
    for (const ps of this.pool.values()) ps.destroy();
    this.pool.clear();
    for (const b of this.bubblePool.values()) b.root.destroy({ children: true });
    this.bubblePool.clear();
  }

  destroy(): void {
    this.clearSprites();
    this.penTexture?.destroy(true);
    this.app.destroy(true, { children: true, texture: true });
  }
}

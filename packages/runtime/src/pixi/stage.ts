import {
  Application,
  Container,
  Graphics,
  Sprite as PixiSprite,
  Text,
  type Texture,
} from 'pixi.js';
import { stageBounds } from '../core/bounds';
import type { Renderer, RenderView } from '../core/renderer';
import type { Sprite } from '../core/sprite';
import { displayTransform } from './transform';

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
}

/** Draws a World with PixiJS v8. Rendering is driven by the caller (no Pixi ticker). */
export class PixiRenderer implements Renderer {
  readonly app = new Application();
  private world = new Container();
  private backdrop = new Graphics();
  /** Clips sprites to the stage: with no implicit fencing they may sit off-stage. */
  private clip = new Graphics();
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
      background: opts.letterbox ?? '#111',
      autoStart: false,
      sharedTicker: false,
      antialias: false,
      autoDensity: true,
      resolution: globalThis.devicePixelRatio || 1,
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
    });
    opts.container.appendChild(r.app.canvas);
    r.app.stage.addChild(r.world);
    r.world.addChild(r.backdrop, r.clip, r.layer, r.bubbles);
    r.layer.sortableChildren = true;
    r.layer.mask = r.clip;
    return r;
  }

  get name(): string {
    return this.app.renderer.name;
  }

  /** Replaces the costume textures (asset id -> texture). */
  setTextures(textures: Map<string, Texture>): void {
    this.clearSprites();
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
      ps.scale.set(t.scale);
      ps.visible = s.visible;
      if (ps.zIndex !== s.layer) ps.zIndex = s.layer;
      this.updateBubble(s, view);
    }
    for (const [s, ps] of this.pool) {
      if (seen.has(s)) continue;
      ps.destroy();
      this.pool.delete(s);
    }
    for (const [s, b] of this.bubblePool) {
      if (seen.has(s)) continue;
      b.root.destroy({ children: true });
      this.bubblePool.delete(s);
    }
    this.app.render();
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
      b = { root, bg, label, text: '' };
      this.bubblePool.set(s, b);
    }
    if (b.text !== s.sayText) {
      b.text = s.sayText;
      b.label.text = s.sayText;
      const w = b.label.width + 16;
      const h = b.label.height + 12;
      b.bg.clear().roundRect(0, 0, w, h, 8).fill('#fff').stroke({ color: '#999', width: 1.5 });
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

  private clearSprites() {
    for (const ps of this.pool.values()) ps.destroy();
    this.pool.clear();
    for (const b of this.bubblePool.values()) b.root.destroy({ children: true });
    this.bubblePool.clear();
  }

  destroy(): void {
    this.clearSprites();
    this.app.destroy(true, { children: true, texture: true });
  }
}

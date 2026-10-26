import type { SpriteInit, StageSettings } from '@stitch/cart';
import { NullAsk, type AskOut } from './ask';
import { NullAudio, type AudioOut, type SongInfo, type SoundInfo } from './audio';
import { createBuiltins, type Builtins } from './builtins';
import { Input } from './input';
import { NullNet, type NetOut } from './net';
import { Pen } from './pen';
import { createRandom } from './random';
import type { RenderView } from './renderer';
import {
  Scheduler,
  STOP_THREAD,
  type EventType,
  type Script,
  type ThreadError,
  type ThreadGen,
} from './scheduler';
import { createSpace, type Space } from './space';
import { spriteAt } from './collide';
import { Sprite, type CostumeInfo } from './sprite';
import * as ops from './values';
import { Dict, type Value } from './values';

export interface WorldOptions {
  stage: StageSettings;
  sprites: SpriteInit[];
  /** The stage's backdrops (asset ids into `costumes`) and the 1-based one shown first. */
  backdrops?: string[];
  backdrop?: number;
  /** Costume metadata by asset id. Sizes come from the decoded images. */
  costumes: Record<string, CostumeInfo>;
  /** Tile map drawn behind sprites, if the cart has one. */
  map?: MapInit;
  /** Sounds and songs in cart order, and where they play. Defaults to silence. */
  sounds?: SoundInfo[];
  songs?: SongInfo[];
  audio?: AudioOut;
  /** Extension block implementations by name (from loadExtensions). Core builtins win clashes. */
  extensions?: Record<string, (S: Sprite, ...args: Value[]) => unknown>;
  /** Where HTTP requests go. Defaults to NullNet (every request fails with status 0). */
  net?: NetOut;
  /** Where `ask` shows its answer field. Defaults to NullAsk (every answer is ""). */
  ask?: AskOut;
  seed?: number;
  /** Clock for the warp budget; injectable for tests. */
  now?: () => number;
  /** Wall clock (ms since 1970) for `current` and `days_since_2000`; sampled once a tick. */
  clock?: () => number;
  /** What `username()` reports. Stitch has no accounts, so players and the editor leave it "". */
  username?: string;
  onLog?: (sprite: string, text: string) => void;
  onError?: (e: { sprite: string; event: string; error: unknown }) => void;
}

export interface MapInit {
  /** Asset id of the tileset costume. */
  tileset: string;
  tileSize: number;
  width: number;
  height: number;
  cells: Uint16Array;
}

/** Live tile map. `dirty` lists cells changed since the renderer last drew them. */
export interface MapState extends MapInit {
  dirty: Set<number>;
  /** The map pixel shown at the stage's top-left (`scroll_map`); 0, 0 at each Run. */
  scroll: { x: number; y: number };
}

/** Signature of compiled programs: `new Function('rt', code)`. */
export type Program = (rt: RuntimeApi) => void;

/** V: the sprite's (or clone's) variables; G: globals; P: variables a sprite shares with its clones. */
export type ModuleFactory = (
  S: Sprite,
  V: Record<string, Value>,
  G: Record<string, Value>,
  P: Record<string, Value>,
) => void;

/** The fixed API compiled code calls. Keep in sync with @stitch/compiler emit.ts. */
export interface RuntimeApi {
  readonly ops: typeof ops;
  readonly b: Builtins;
  readonly G: Record<string, Value>;
  defineModule(id: string, factory: ModuleFactory): void;
  /** sprite id ("$stage" for the stage) -> module id */
  instantiate(map: Record<string, string>): void;
  on(S: Sprite, event: EventType, arg: string | null, body: () => ThreadGen): void;
  /** True once the current tick has run longer than WARP_BUDGET_MS; warp loops then yield. */
  overBudget(): boolean;
  readonly STOP: typeof STOP_THREAD;
}

export const STAGE_ID = '$stage';

/** A warp loop may run this long in one tick before it yields anyway (as Scratch). */
export const WARP_BUDGET_MS = 500;

/** A sprite and its clones. */
interface Family {
  factory: ModuleFactory | undefined;
  shared: Record<string, Value>;
  clones: Set<Sprite>;
}

export class World implements RenderView {
  readonly space: Space;
  readonly input = new Input();
  readonly scheduler: Scheduler;
  readonly stage: Sprite;
  /** Cart order (script order). */
  readonly all: Sprite[];
  /** Replaced by `set_seed`. */
  random: () => number;
  readonly pen: Pen;
  /** Latest value of each `watch`, shown on stage by the renderer. */
  readonly watches = new Map<string, string>();
  readonly cloneLimit: number;
  private families = new Map<Sprite, Family>();
  /** Live clones by id ("Name#k"). */
  private cloneById = new Map<string, Sprite>();
  private byName = new Map<string, Sprite>();
  private cloneCount = 0;
  private cloneSeq = 0;
  private G = Object.create(null) as Record<string, Value>;
  readonly map: MapState | undefined;
  readonly audio: AudioOut;
  readonly net: NetOut;
  readonly asker: AskOut;
  /** The last answer to `ask`, for `answer()`: one for the whole program, as in Scratch. */
  answer = '';
  /** Questions wait their turn behind this; `stopAll` starts a new queue. */
  askQueue: Promise<unknown> = Promise.resolve();
  /** Bumped by `stopAll`, so questions queued before it never open. */
  askGeneration = 0;
  readonly sounds: readonly SoundInfo[];
  readonly songs: readonly SongInfo[];
  /** Percent, as Scratch. */
  volume = 100;
  ticks = 0;
  timerStart = 0;
  /** Microphone level 0–100, or -1 with no microphone (as Scratch). */
  loudness = -1;
  /** The wall clock at the start of this tick, so every script in a tick sees one time (D33). */
  wallTime = 0;
  readonly username: string;
  /** The sprite being dragged (drag mode on) and where the pointer holds it. */
  private drag: { sprite: Sprite; dx: number; dy: number } | undefined;
  /** Seconds since Run or the last `reset_timer`, in simulation time (D4). */
  get timer(): number {
    return (this.ticks - this.timerStart) / 60;
  }
  private tickStart = 0;
  private readonly now: () => number;
  private readonly clock: () => number;
  private drawList: Sprite[];
  private currentSprite = '';

  constructor(private opts: WorldOptions) {
    this.space = createSpace(opts.stage);
    this.now = opts.now ?? (() => performance.now());
    this.random = createRandom(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.scheduler = new Scheduler((e) => this.reportError(e));
    const backdrops = (opts.backdrops ?? [])
      .map((id) => opts.costumes[id])
      .filter((c): c is CostumeInfo => c !== undefined);
    this.stage = new Sprite(STAGE_ID, 'stage', backdrops, true);
    // The backdrop's centre sits at the stage's centre, as in Scratch.
    const mid = this.space.fromStagePx(this.space.width / 2, this.space.height / 2);
    this.stage.moveTo(mid.x, mid.y);
    if (backdrops.length)
      this.stage.costume = Math.max(0, Math.min(backdrops.length - 1, (opts.backdrop ?? 1) - 1));
    this.clock = opts.clock ?? (() => Date.now());
    this.username = opts.username ?? '';
    this.wallTime = this.clock();
    this.all = opts.sprites.map((init) => {
      const costumes = init.costumes
        .map((id) => opts.costumes[id])
        .filter((c): c is CostumeInfo => c !== undefined);
      const s = new Sprite(init.id, init.name, costumes);
      s.x = init.x;
      s.y = init.y;
      s.direction = init.direction;
      s.size = init.size;
      s.visible = init.visible;
      s.layer = init.layer;
      s.costume = costumes.length
        ? Math.max(0, Math.min(costumes.length - 1, init.costume - 1))
        : 0;
      return s;
    });
    this.audio = opts.audio ?? new NullAudio();
    this.net = opts.net ?? new NullNet();
    this.asker = opts.ask ?? new NullAsk();
    this.sounds = opts.sounds ?? [];
    this.songs = opts.songs ?? [];
    this.drawList = this.all.slice().sort((a, c) => a.layer - c.layer);
    this.renumber();
    for (const s of this.all) {
      this.families.set(s, { factory: undefined, shared: Object.create(null), clones: new Set() });
      if (!this.byName.has(s.name)) this.byName.set(s.name, s);
    }
    this.families.set(this.stage, {
      factory: undefined,
      shared: Object.create(null),
      clones: new Set(),
    });
    this.pen = new Pen(this.space);
    this.cloneLimit = opts.stage.cloneLimit;
    this.map = opts.map
      ? { ...opts.map, cells: opts.map.cells.slice(), dirty: new Set(), scroll: { x: 0, y: 0 } }
      : undefined;
  }

  get sprites(): readonly Sprite[] {
    return this.drawList;
  }

  /** Costume metadata by asset id, including the map's tileset. */
  get costumes(): Readonly<Record<string, CostumeInfo>> {
    return this.opts.costumes;
  }

  get globals(): Readonly<Record<string, Value>> {
    return this.G;
  }

  /** Runs the compiled program: defines modules, instantiates sprites, registers scripts. */
  load(program: Program): void {
    const modules = new Map<string, ModuleFactory>();
    const G = this.G;
    const rt: RuntimeApi = {
      ops,
      b: Object.assign({}, this.opts.extensions, createBuiltins(this)),
      G,
      STOP: STOP_THREAD,
      defineModule: (id, f) => void modules.set(id, f),
      instantiate: (map) => {
        // Stage first, then sprites in cart order: this is the script (and thread) order.
        for (const s of [this.stage, ...this.all]) {
          const id = map[s.id];
          if (id === undefined) continue;
          const f = modules.get(id);
          if (!f) throw new Error(`unknown module ${id}`);
          this.currentSprite = s.name;
          const fam = this.families.get(s)!;
          fam.factory = f;
          f(s, s.vars, G, fam.shared);
        }
      },
      overBudget: () => this.now() - this.tickStart > WARP_BUDGET_MS,
      on: (S, event, arg, body) =>
        this.scheduler.add({ sprite: S, event, arg, body } satisfies Script),
    };
    program(rt);
  }

  /** Green flag. */
  start(): void {
    this.scheduler.trigger('start', null, true);
  }

  tick(): void {
    this.tickStart = this.now();
    this.wallTime = this.clock();
    for (const key of this.input.takePressed()) this.scheduler.trigger('key', key, false);
    for (const c of this.input.takeClicks()) {
      const p = this.space.toStagePx(c.x, c.y);
      // The topmost sprite under the pointer gets the click; empty stage goes to the stage.
      const hit = spriteAt(this.drawList, this.space, p.x, p.y) ?? this.stage;
      if (hit.draggable && !hit.deleted) {
        // Scratch brings a dragged sprite to the front.
        this.drag = { sprite: hit, dx: hit.x - c.x, dy: hit.y - c.y };
        this.moveLayer(hit, Infinity);
      }
      this.scheduler.trigger('click', null, true, hit);
    }
    const d = this.drag;
    if (d && (!this.input.mouseDown || d.sprite.deleted || !d.sprite.draggable))
      this.drag = undefined;
    else if (d) d.sprite.moveTo(this.input.mouseX + d.dx, this.input.mouseY + d.dy);
    this.scheduler.checkEdges((e) => (e === 'timer' ? this.timer : this.loudness));
    this.scheduler.step();
    this.ticks++;
  }

  /** The Stop button: ends every thread and silences sounds and music. */
  stopAll(): void {
    this.scheduler.stopAll();
    this.askGeneration++;
    this.askQueue = Promise.resolve();
    this.asker.cancel();
    this.audio.stopSounds();
    this.audio.stopMusic();
  }

  /** Scratch's "stop all": ends every thread and removes every clone. */
  stopEverything(): void {
    for (const fam of this.families.values()) for (const c of [...fam.clones]) this.deleteClone(c);
    this.stopAll();
  }

  // ---- clones ----

  /**
   * Makes a clone of `parent` (a sprite, or a clone cloning itself). The clone copies the
   * parent's state and variables, sits just behind it, and runs its `on clone` scripts from the
   * next tick. Past the cart's clone limit it throws, so the script stops at that line (D25).
   */
  createClone(parent: Sprite): Sprite {
    if (parent.isStage) throw new Error("the stage can't be cloned");
    if (this.cloneCount >= this.cloneLimit)
      throw new Error(
        `clone limit reached (${this.cloneLimit} clones). Delete clones you no longer need, or raise the limit under Cart → Stage`,
      );
    const fam = this.families.get(parent.original)!;
    const c = new Sprite(
      `${parent.original.id}#${++this.cloneSeq}`,
      parent.name,
      parent.costumes,
      false,
      {
        of: parent,
        number: this.cloneSeq,
      },
    );
    c.moveTo(parent.x, parent.y);
    c.direction = parent.direction;
    c.size = parent.size;
    c.costume = parent.costume;
    c.visible = parent.visible;
    c.rotationStyle = parent.rotationStyle;
    c.effects = { ...parent.effects };
    c.soundEffects = { ...parent.soundEffects };
    c.draggable = parent.draggable;
    c.pen = { ...parent.pen };
    c.penMoved = parent.penMoved;
    fam.clones.add(c);
    this.cloneById.set(c.handle, c);
    this.cloneCount++;
    // Scratch puts a new clone directly behind its parent.
    this.drawList.splice(this.drawList.indexOf(parent), 0, c);
    this.renumber();
    // Run the module for the clone (its own V, the family's P), then copy the parent's values.
    fam.factory?.(c, c.vars, this.G, fam.shared);
    for (const k of Object.keys(parent.vars)) c.vars[k] = deepCopy(parent.vars[k]!);
    this.scheduler.trigger('clone', null, true, c);
    return c;
  }

  /** Removes a clone, its scripts and its threads. Originals can't be deleted. */
  deleteClone(c: Sprite): void {
    if (!c.isClone || c.deleted) return;
    c.deleted = true;
    c.penMoved = undefined;
    this.families.get(c.original)!.clones.delete(c);
    this.cloneById.delete(c.handle);
    this.cloneCount--;
    this.scheduler.removeSprite(c);
    const i = this.drawList.indexOf(c);
    if (i >= 0) this.drawList.splice(i, 1);
    this.renumber();
  }

  /** Live clones of a sprite, oldest first. */
  clonesOf(original: Sprite): Sprite[] {
    return [...(this.families.get(original.original)?.clones ?? [])];
  }

  /** A sprite by name (the original), clone id ("Name#k"), or "stage". */
  find(id: string): Sprite | undefined {
    return (
      this.cloneById.get(id) ??
      this.byName.get(id) ??
      (id.toLowerCase() === 'stage' ? this.stage : undefined)
    );
  }

  /** Variables the sprite shares with its clones. */
  sharedVars(s: Sprite): Record<string, Value> {
    return this.families.get(s.original)?.shared ?? {};
  }

  // ---- layers ----

  /** Moves a sprite within the draw order: to an index, clamped to the list. */
  moveLayer(s: Sprite, to: number): void {
    const i = this.drawList.indexOf(s);
    if (i < 0) return;
    this.drawList.splice(i, 1);
    const j = Math.max(0, Math.min(this.drawList.length, Math.round(to)));
    this.drawList.splice(j, 0, s);
    this.renumber();
  }

  layerIndex(s: Sprite): number {
    return this.drawList.indexOf(s);
  }

  /** `layer` mirrors draw order, so the renderer's z-order follows it. */
  private renumber(): void {
    this.drawList.forEach((s, i) => (s.layer = i));
  }

  log(text: string): void {
    this.opts.onLog?.(this.scheduler.current?.script.sprite.name ?? this.currentSprite, text);
  }

  private reportError(e: ThreadError): void {
    const ev = e.script.event + (e.script.arg !== null ? ` "${e.script.arg}"` : '');
    if (this.opts.onError)
      this.opts.onError({ sprite: e.script.sprite.name, event: ev, error: e.error });
    else console.error(`[${e.script.sprite.name} on ${ev}]`, e.error);
  }
}

/** Clones copy lists and dictionaries, so a clone's changes don't reach its parent (as Scratch). */
function deepCopy(v: Value): Value {
  if (Array.isArray(v)) return v.map(deepCopy);
  if (v instanceof Dict) return new Dict([...v].map(([k, x]) => [k, deepCopy(x)]));
  return v;
}

export function createWorld(opts: WorldOptions): World {
  return new World(opts);
}

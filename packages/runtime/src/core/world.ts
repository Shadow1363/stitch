import type { SpriteInit, StageSettings } from '@stitch/cart';
import { createBuiltins, type Builtins } from './builtins';
import { Input } from './input';
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
import { Sprite, type CostumeInfo } from './sprite';
import * as ops from './values';
import type { Value } from './values';

export interface WorldOptions {
  stage: StageSettings;
  sprites: SpriteInit[];
  /** Costume metadata by asset id. Sizes come from the decoded images. */
  costumes: Record<string, CostumeInfo>;
  seed?: number;
  /** Clock for the warp budget; injectable for tests. */
  now?: () => number;
  onLog?: (sprite: string, text: string) => void;
  onError?: (e: { sprite: string; event: string; error: unknown }) => void;
}

/** Signature of compiled programs: `new Function('rt', code)`. */
export type Program = (rt: RuntimeApi) => void;

export type ModuleFactory = (S: Sprite, V: Record<string, Value>, G: Record<string, Value>) => void;

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

export class World implements RenderView {
  readonly space: Space;
  readonly input = new Input();
  readonly scheduler: Scheduler;
  readonly stage: Sprite;
  /** Cart order (script order). */
  readonly all: Sprite[];
  readonly random: () => number;
  ticks = 0;
  timerStart = 0;
  private tickStart = 0;
  private readonly now: () => number;
  private drawList: Sprite[];
  private currentSprite = '';

  constructor(private opts: WorldOptions) {
    this.space = createSpace(opts.stage);
    this.now = opts.now ?? (() => performance.now());
    this.random = createRandom(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.scheduler = new Scheduler((e) => this.reportError(e));
    this.stage = new Sprite(STAGE_ID, 'stage', [], true);
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
    this.drawList = this.all.slice().sort((a, c) => a.layer - c.layer);
  }

  get sprites(): readonly Sprite[] {
    return this.drawList;
  }

  /** Runs the compiled program: defines modules, instantiates sprites, registers scripts. */
  load(program: Program): void {
    const modules = new Map<string, ModuleFactory>();
    const G = Object.create(null) as Record<string, Value>;
    const rt: RuntimeApi = {
      ops,
      b: createBuiltins(this),
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
          f(s, s.vars, G);
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
    for (const key of this.input.takePressed()) this.scheduler.trigger('key', key, false);
    this.scheduler.step();
    this.ticks++;
  }

  stopAll(): void {
    this.scheduler.stopAll();
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

export function createWorld(opts: WorldOptions): World {
  return new World(opts);
}

/**
 * Runs a loaded cart in a page: renderer, audio, input, the fixed-step loop and a fresh world
 * per Run. Shared by the editor's sandboxed stage (host.ts, driven over postMessage) and
 * exported players, so both run carts exactly the same way.
 */
import { loadExtensions } from './core/extensions';
import { createLoop } from './core/loop';
import type { NetOut } from './core/net';
import { World, type Program } from './core/world';
import { PixiRenderer, type RendererPreference } from './pixi/stage';
import { texturesFromCostumes } from './pixi/textures';
import type { LoadPayload } from './protocol';
import { stageShortcut, type StageShortcut } from './shortcuts';
import { FrameStats } from './stats';
import { DomAsk, fromAskField, type StageRect } from './web/ask';
import { WebAudioOut } from './web/audio';

const PREVENT = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ']);

export interface RunnerError {
  sprite: string;
  event: string;
  message: string;
  /** 1-based line in the compiled code. */
  line?: number;
}

export interface StageRunnerOptions {
  container: HTMLElement;
  preference?: RendererPreference;
  net: NetOut;
  onLog: (sprite: string, text: string) => void;
  onError: (e: RunnerError) => void;
  /** Called before each fresh world, e.g. to forget a previous run's pending requests. */
  onReset?: () => void;
  /** Run, Pause and Stop chords pressed in the stage; they never reach the game. */
  onShortcut?: (action: StageShortcut) => void;
}

export class StageRunner {
  readonly stats = new FrameStats();
  readonly audio = new WebAudioOut();
  readonly asker: DomAsk;
  private payload: LoadPayload | undefined;
  private program: Program | undefined;
  private costumeInfo: ReturnType<typeof texturesFromCostumes>['costumes'] = {};
  private world: World | undefined;
  private tickAcc = 0;
  private lineOffset = functionLineOffset();
  private frameErrors = new Set<string>();
  /** False between a load and the next run, when 0 threads doesn't mean "finished". */
  started = false;
  private loop: ReturnType<typeof createLoop> | undefined;

  /** Microphone level for `loudness`, kept across Runs: -1 until something measures it. */
  private loudness = -1;

  /** The latest microphone level (0–100), from the editor or the player's own microphone. */
  setLoudness(level: number): void {
    this.loudness = level;
    if (this.world) this.world.loudness = level;
  }

  get paused(): boolean {
    return this.loop?.paused ?? false;
  }

  /** Pauses or resumes: ticks and sound stop, the picture stays; keys pressed meanwhile are ignored. */
  setPaused(p: boolean): void {
    if (!this.loop || this.loop.paused === p) return;
    this.loop.paused = p;
    this.world?.input.releaseAll();
    if (p) void this.audio.ctx.suspend().catch(() => {});
    else this.audio.unlock();
  }

  private constructor(
    readonly renderer: PixiRenderer,
    private opts: StageRunnerOptions,
  ) {
    this.asker = new DomAsk(
      () => this.stageRect(),
      () => opts.container.focus(),
    );
    const loop = createLoop({
      tick: () => {
        if (!this.world) return;
        const t0 = performance.now();
        this.world.tick();
        this.tickAcc += performance.now() - t0;
      },
      render: () => {
        const t0 = performance.now();
        if (this.world) renderer.render(this.world);
        this.stats.frame(this.tickAcc, performance.now() - t0);
        this.tickAcc = 0;
      },
      // Reported once per message, so a failing frame doesn't flood the console 60 times a second.
      onError: (err) => {
        const key = String(err);
        if (this.frameErrors.has(key)) return;
        this.frameErrors.add(key);
        this.error('stage', 'frame', err);
      },
    });
    loop.start();
    this.loop = loop;
    this.listen();
  }

  static async create(opts: StageRunnerOptions): Promise<StageRunner> {
    const renderer = await PixiRenderer.create({
      container: opts.container,
      preference: opts.preference ?? 'webgl',
    });
    return new StageRunner(renderer, opts);
  }

  get threads(): number {
    return this.world?.scheduler.activeCount ?? 0;
  }

  /** Takes a new cart and shows its starting state. False when its code doesn't compile. */
  load(payload: LoadPayload): boolean {
    this.payload = payload;
    try {
      this.program = new Function('rt', payload.code) as Program;
    } catch (err) {
      this.program = undefined;
      this.error('stage', 'compile', err);
      return false;
    }
    const t = texturesFromCostumes(payload.costumes, payload.stage.scaling.filter === 'pixel');
    this.renderer.setTextures(t.textures);
    this.costumeInfo = t.costumes;
    this.audio.setClips(payload.sounds, payload.songs);
    this.world = this.build();
    this.started = false;
    return true;
  }

  /** Starts from the initial state, like the green flag. Call from a gesture so audio can start. */
  run(): void {
    this.setPaused(false);
    this.audio.unlock();
    this.world = this.build();
    this.world?.start();
    this.started = this.world !== undefined;
    this.opts.container.focus();
  }

  stop(): void {
    this.setPaused(false);
    this.world?.stopAll();
  }

  /** A fresh world from the loaded cart: Run always starts from the initial state. */
  private build(): World | undefined {
    const { payload, program } = this;
    if (!payload || !program) return undefined;
    // Each run starts silent at full volume, like the green flag.
    this.audio.stopSounds();
    this.audio.stopMusic();
    this.audio.setVolume(1);
    this.asker.cancel();
    this.opts.onReset?.();
    // Fresh each run, so state an extension keeps in its closure resets like variables do.
    const ext = loadExtensions(payload.extensions, {
      net: this.opts.net,
      log: (id, text) => this.opts.onLog(`extension ${id}`, text),
    });
    for (const e of ext.errors)
      this.opts.onError({ sprite: `extension ${e.id}`, event: 'load', message: e.message });
    const w = new World({
      stage: payload.stage,
      sprites: payload.sprites,
      backdrops: payload.backdrops,
      backdrop: payload.backdrop,
      costumes: this.costumeInfo,
      ...(payload.map ? { map: payload.map } : {}),
      sounds: payload.sounds.map((c) => ({
        id: c.id,
        name: c.name,
        seconds: c.samples.length / c.rate,
      })),
      songs: payload.songs.map((c) => ({ id: c.id, name: c.name })),
      audio: this.audio,
      net: this.opts.net,
      ask: this.asker,
      extensions: ext.impls,
      onLog: this.opts.onLog,
      onError: (e) => this.error(e.sprite, e.event, e.error),
    });
    w.loudness = this.loudness;
    try {
      w.load(program);
    } catch (err) {
      this.error('stage', 'load', err);
      return undefined;
    }
    return w;
  }

  /** Where the stage is drawn in the page: the canvas without its letterbox. */
  private stageRect(): StageRect {
    const r = this.renderer.app.canvas.getBoundingClientRect();
    const space = this.world?.space;
    if (!space) return r;
    const fit = space.fit(r.width, r.height);
    return {
      left: r.left + fit.offX,
      top: r.top + fit.offY,
      width: space.width * fit.scale,
      height: space.height * fit.scale,
    };
  }

  private error(sprite: string, event: string, err: unknown): void {
    this.opts.onError({ sprite, event, ...describe(err, this.lineOffset) });
  }

  private listen(): void {
    const { container } = this.opts;
    container.tabIndex = 0;
    // Otherwise the first gesture inside the stage unlocks audio.
    addEventListener('pointerdown', () => this.audio.unlock(), true);
    addEventListener('keydown', (e) => {
      this.audio.unlock();
      const shortcut = this.opts.onShortcut && stageShortcut(e);
      if (shortcut) {
        e.preventDefault();
        this.opts.onShortcut!(shortcut);
        return;
      }
      // Typing an answer to `ask` isn't playing the game (D32).
      if (fromAskField(e.target) || this.paused) return;
      if (PREVENT.has(e.key)) e.preventDefault();
      if (!e.repeat) this.world?.input.keyDown(e.key);
    });
    addEventListener('keyup', (e) => this.world?.input.keyUp(e.key));
    addEventListener('blur', () => this.world?.input.releaseAll());
    // Pointer in cart coordinates, through the same fit the renderer letterboxes with.
    const toCart = (e: PointerEvent) => {
      const w = this.world;
      if (!w) return undefined;
      const r = this.renderer.app.canvas.getBoundingClientRect();
      const fit = w.space.fit(r.width, r.height);
      return w.space.fromStagePx(
        (e.clientX - r.left - fit.offX) / fit.scale,
        (e.clientY - r.top - fit.offY) / fit.scale,
      );
    };
    container.addEventListener('pointermove', (e) => {
      const p = toCart(e);
      if (p) this.world?.input.pointerMove(p.x, p.y);
    });
    container.addEventListener('pointerdown', (e) => {
      if (fromAskField(e.target)) return;
      const p = toCart(e);
      if (p) this.world?.input.pointerDown(p.x, p.y);
    });
    addEventListener('pointerup', () => this.world?.input.pointerUp());
  }
}

/** Line in the stack of `new Function` code where the body starts, measured not assumed. */
function functionLineOffset(): number {
  try {
    new Function('throw new Error("probe")')();
  } catch (e) {
    const line = stackLine(e);
    if (line !== undefined) return line - 1;
  }
  return 2;
}

function stackLine(e: unknown): number | undefined {
  const stack = e instanceof Error ? (e.stack ?? '') : '';
  const m = /<anonymous>:(\d+):\d+/.exec(stack) ?? /Function:(\d+):\d+/.exec(stack);
  return m ? Number(m[1]) : undefined;
}

function describe(e: unknown, offset: number): { message: string; line?: number } {
  const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  const line = stackLine(e);
  return line !== undefined ? { message, line: line - offset } : { message };
}

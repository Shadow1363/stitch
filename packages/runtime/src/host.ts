/**
 * Entry point inside the sandboxed stage iframe (sandbox="allow-scripts", opaque origin).
 * Talks to the editor only through postMessage; see protocol.ts.
 */
import { createLoop } from './core/loop';
import { World, type Program } from './core/world';
import { PixiRenderer, type RendererPreference } from './pixi/stage';
import { texturesFromCostumes } from './pixi/textures';
import { PROTOCOL_VERSION, type FromStage, type LoadPayload, type ToStage } from './protocol';
import { FrameStats } from './stats';

const PREVENT = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ']);

export async function startHost(container: HTMLElement = document.body): Promise<void> {
  const post = (m: FromStage) => parent.postMessage(m, '*');
  const pref =
    (new URLSearchParams(location.search).get('renderer') as RendererPreference | null) ?? 'webgl';
  const renderer = await PixiRenderer.create({ container, preference: pref });
  const lineOffset = functionLineOffset();
  const stats = new FrameStats();

  let payload: LoadPayload | undefined;
  let program: Program | undefined;
  let costumeInfo: ReturnType<typeof texturesFromCostumes>['costumes'] = {};
  let world: World | undefined;
  let tickAcc = 0;

  /** A fresh world from the loaded cart: Run always starts from the initial state. */
  const build = (): World | undefined => {
    if (!payload || !program) return undefined;
    const w = new World({
      stage: payload.stage,
      sprites: payload.sprites,
      costumes: costumeInfo,
      onLog: (sprite, text) => post({ t: 'log', sprite, text }),
      onError: (e) =>
        post({ t: 'error', sprite: e.sprite, event: e.event, ...describe(e.error, lineOffset) }),
    });
    try {
      w.load(program);
    } catch (err) {
      post({ t: 'error', sprite: 'stage', event: 'load', ...describe(err, lineOffset) });
      return undefined;
    }
    return w;
  };

  const loop = createLoop({
    tick: () => {
      if (!world) return;
      const t0 = performance.now();
      world.tick();
      tickAcc += performance.now() - t0;
    },
    render: () => {
      const t0 = performance.now();
      if (world) renderer.render(world);
      const r = performance.now() - t0;
      stats.frame(tickAcc, r);
      tickAcc = 0;
    },
  });
  loop.start();

  setInterval(
    () => post({ t: 'stats', ...stats.take(), threads: world?.scheduler.activeCount ?? 0 }),
    250,
  );

  addEventListener('message', (e: MessageEvent<ToStage>) => {
    if (e.source !== parent) return;
    const m = e.data;
    switch (m.t) {
      case 'load': {
        if (m.v !== PROTOCOL_VERSION) return;
        payload = m;
        try {
          program = new Function('rt', m.code) as Program;
        } catch (err) {
          program = undefined;
          post({ t: 'error', sprite: 'stage', event: 'compile', ...describe(err, lineOffset) });
          return;
        }
        const t = texturesFromCostumes(m.costumes, m.stage.scaling.filter === 'pixel');
        renderer.setTextures(t.textures);
        costumeInfo = t.costumes;
        world = build();
        post({ t: 'loaded' });
        return;
      }
      case 'run':
        world = build();
        world?.start();
        container.focus();
        return;
      case 'stop':
        world?.stopAll();
        return;
      case 'ping':
        post({ t: 'pong', n: m.n });
        return;
    }
  });

  container.tabIndex = 0;
  addEventListener('keydown', (e) => {
    if (PREVENT.has(e.key)) e.preventDefault();
    if (!e.repeat) world?.input.keyDown(e.key);
  });
  addEventListener('keyup', (e) => world?.input.keyUp(e.key));
  addEventListener('blur', () => world?.input.releaseAll());

  post({ t: 'ready', v: PROTOCOL_VERSION, renderer: renderer.name });
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

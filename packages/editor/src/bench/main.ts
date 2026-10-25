/**
 * Benchmark: N sprites, each running real compiled Stitch through the scheduler, drawn by Pixi.
 *   /bench.html?n=1000&renderer=webgl|webgpu&sandbox=1&seconds=10&clones=1
 * clones=1: one sprite makes the other n - 1 balls with create_clone.
 * Pass bar (Phase 1): average >= 59 fps and p95 frame <= 18 ms at n=1000.
 */
import { DEFAULT_STAGE, type SpriteInit } from '@stitch/cart';
import { compile } from '@stitch/compiler';
import { IR_VERSION, type Project } from '@stitch/ir';
import { parse } from '@stitch/lang';
import { createLoop, World, type Program } from '@stitch/runtime';
import { StageClient } from '@stitch/runtime/bridge';
import { PixiRenderer, texturesFromCostumes, type RendererPreference } from '@stitch/runtime/pixi';
import type { CostumeImage } from '@stitch/runtime/protocol';
import { FrameStats } from '@stitch/runtime/stats';

const q = new URLSearchParams(location.search);
const N = Number(q.get('n') ?? 1000);
const pref = (q.get('renderer') ?? 'webgl') as RendererPreference;
const sandbox = q.get('sandbox') === '1';
const seconds = Number(q.get('seconds') ?? 10);
const clones = q.get('clones') === '1';
const hud = document.getElementById('hud')!;
const host = document.getElementById('stage')!;

const BALL_LOOP = `  forever do
    x += vx
    y += vy
    turn(3)
    local edge = on_edge()
    if edge == "left" or edge == "right" then
      vx = -vx
    end
    if edge == "top" or edge == "bottom" then
      vy = -vy
    end
    clamp_to_stage()
  end
`;

const BALL = `var vx = random(-4, 4) + 0.5
var vy = random(-4, 4) + 0.5

on start do
  goto(random(-200, 200), random(-150, 150))
${BALL_LOOP}end
`;

/** One sprite that clones itself; each clone picks its own speed and place. */
const CLONING_BALL = `var vx = 0
var vy = 0

on start do
  repeat ${N - 1} do
    create_clone()
  end
end

on clone do
  vx = random(-4, 4) + 0.5
  vy = random(-4, 4) + 0.5
  goto(random(-200, 200), random(-150, 150))
${BALL_LOOP}end
`;

async function ballImage(): Promise<CostumeImage> {
  const c = new OffscreenCanvas(16, 16);
  const g = c.getContext('2d')!;
  g.fillStyle = '#ff8c28';
  g.beginPath();
  g.arc(8, 8, 7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.fillRect(10, 5, 3, 3);
  return {
    id: 'ball',
    name: 'ball',
    bitmap: await createImageBitmap(c),
    pixelArt: false,
    center: [8, 8],
  };
}

function program() {
  const module = parse(clones ? CLONING_BALL : BALL).module;
  const sprites: SpriteInit[] = Array.from({ length: clones ? 1 : N }, (_, i) => ({
    id: `b${i}`,
    name: `Ball${i}`,
    x: 0,
    y: 0,
    direction: 90,
    size: 100,
    visible: true,
    layer: i,
    costumes: ['ball'],
    costume: 1,
  }));
  const project: Project = {
    irVersion: IR_VERSION,
    stage: { items: [] },
    sprites: sprites.map((s) => ({ id: s.id, name: s.name, module })),
  };
  const r = compile(project);
  if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
  return { code: r.code, sprites };
}

interface Sample {
  fps: number;
  tickMs: number;
  renderMs: number;
  threads: number;
}

function report(samples: Sample[], p95: number | undefined, renderer: string, done: boolean) {
  const last = samples[samples.length - 1];
  const steady = samples.slice(4); // skip the first second (shader compile, warm-up)
  const mean = (f: (s: Sample) => number) =>
    steady.length ? steady.reduce((a, s) => a + f(s), 0) / steady.length : 0;
  const avg = mean((s) => s.fps);
  const tick = mean((s) => s.tickMs);
  const render = mean((s) => s.renderMs);
  const pass = avg >= 59 && (p95 === undefined || p95 <= 18);
  hud.textContent = [
    `sprites   ${N}${clones ? ' (clones)' : ''}${sandbox ? '  (sandboxed iframe)' : ''}`,
    `renderer  ${renderer}`,
    `fps       ${last ? last.fps.toFixed(1) : '…'}   avg ${avg.toFixed(1)}`,
    p95 !== undefined ? `p95 frame ${p95.toFixed(2)} ms` : `p95 frame n/a in sandbox mode`,
    `tick      ${tick.toFixed(2)} ms   render ${render.toFixed(2)} ms  (per frame, averaged)`,
    `threads   ${last?.threads ?? 0}`,
    done
      ? `result    ${pass ? 'PASS' : 'FAIL'} (avg ≥ 59 fps, p95 ≤ 18 ms over ${seconds}s)`
      : `measuring ${seconds}s…`,
  ].join('\n');
  if (done) {
    const result = {
      n: N,
      renderer,
      sandbox,
      clones,
      avgFps: +avg.toFixed(2),
      p95: p95 === undefined ? null : +p95.toFixed(2),
      tickMs: +tick.toFixed(3),
      renderMs: +render.toFixed(3),
      pass,
    };
    (window as unknown as { benchResult: unknown }).benchResult = result;
    console.log('BENCH_RESULT', JSON.stringify(result));
  }
}

async function inPage() {
  const { code, sprites } = program();
  const renderer = await PixiRenderer.create({ container: host, preference: pref });
  const { textures, costumes } = texturesFromCostumes([await ballImage()], false);
  renderer.setTextures(textures);
  const world = new World({
    stage: { ...DEFAULT_STAGE, background: '#1d2330', cloneLimit: N },
    sprites,
    costumes,
    seed: 1234,
  });
  world.load(new Function('rt', code) as Program);
  world.start();
  const stats = new FrameStats();
  let tickMs = 0;
  const loop = createLoop({
    tick: () => {
      const t0 = performance.now();
      world.tick();
      tickMs += performance.now() - t0;
    },
    render: () => {
      const t0 = performance.now();
      renderer.render(world);
      stats.frame(tickMs, performance.now() - t0);
      tickMs = 0;
    },
  });
  loop.start();
  const samples: Sample[] = [];
  const started = performance.now();
  const timer = setInterval(() => {
    samples.push({ ...stats.take(), threads: world.scheduler.activeCount });
    const done = performance.now() - started >= (seconds + 1) * 1000;
    report(samples, stats.p95(), renderer.name, done);
    if (done) clearInterval(timer);
  }, 250);
}

async function inSandbox() {
  const { code, sprites } = program();
  const samples: Sample[] = [];
  let renderer = pref;
  let started = 0;
  const client = new StageClient(host, {
    src: `/stage.html?renderer=${pref}`,
    onMessage: async (m) => {
      if (m.t === 'ready') {
        renderer = m.renderer as RendererPreference;
        client.load({
          code,
          stage: { ...DEFAULT_STAGE, background: '#1d2330', cloneLimit: N },
          sprites,
          backdrops: [],
          backdrop: 1,
          costumes: [await ballImage()],
          sounds: [],
          songs: [],
          extensions: [],
        });
        client.run();
        started = performance.now();
      }
      if (m.t === 'stats' && started) {
        samples.push(m);
        const done = performance.now() - started >= (seconds + 1) * 1000;
        report(samples, undefined, renderer, done);
        if (done) client.stop();
      }
    },
  });
}

void (sandbox ? inSandbox() : inPage()).catch((e: unknown) => {
  hud.textContent = `error: ${String(e)}`;
  console.error(e);
});

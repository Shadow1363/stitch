/**
 * Test helper: runs a sample built from source on World with NullRenderer, the way the
 * stage would (compiled code, costume pixels for sensing, the cart's map, sounds and songs).
 */
import {
  composite,
  decodeLayers,
  decodeTiles,
  type PixelAsset,
  type SpriteInit,
  type StageSettings,
  type TileMap,
} from '@stitch/cart';
import { compile } from '@stitch/compiler';
import { IR_VERSION, type Project } from '@stitch/ir';
import { parse } from '@stitch/lang';
import { NullAsk, NullRenderer, World, type CostumeInfo, type Program } from '@stitch/runtime';

export interface SampleParts {
  stage: StageSettings;
  sprites: SpriteInit[];
  palette: string[];
  assets: Record<string, PixelAsset>;
  map?: TileMap;
  sounds?: Record<string, { name: string }>;
  music?: { songs: Record<string, { name: string }> };
}

export function projectOf(parts: SampleParts, sources: Record<string, string>): Project {
  return {
    irVersion: IR_VERSION,
    stage: parse(sources.stage ?? '').module,
    sprites: parts.sprites.map((s) => ({
      id: s.id,
      name: s.name,
      module: parse(sources[s.id] ?? '').module,
    })),
  };
}

function costumes(parts: SampleParts): Record<string, CostumeInfo> {
  const out: Record<string, CostumeInfo> = {};
  for (const [id, a] of Object.entries(parts.assets)) {
    const img = decodeLayers(a.width, a.height, a.layers);
    out[id] = {
      id,
      name: a.name,
      width: a.width,
      height: a.height,
      center: a.center,
      pixelArt: true,
      pixels: composite(img, parts.palette),
    };
  }
  return out;
}

/** Compiles and starts a sample. `tick(n)` runs n ticks, letting promises settle between them. */
export function runSample(parts: SampleParts, sources: Record<string, string>, seed = 1) {
  const project = projectOf(parts, sources);
  const r = compile(
    project,
    parts.sprites.map((s) => s.id),
  );
  if (!r.ok) throw new Error(JSON.stringify(r.diagnostics, null, 1));
  const errors: string[] = [];
  const m = parts.map;
  const world = new World({
    stage: parts.stage,
    sprites: parts.sprites,
    costumes: costumes(parts),
    ...(m
      ? {
          map: {
            tileset: m.tileset,
            tileSize: m.tileSize,
            width: m.width,
            height: m.height,
            cells: decodeTiles(m),
          },
        }
      : {}),
    sounds: Object.entries(parts.sounds ?? {}).map(([id, s]) => ({
      id,
      name: s.name,
      seconds: 0.2,
    })),
    songs: Object.entries(parts.music?.songs ?? {}).map(([id, s]) => ({ id, name: s.name })),
    ask: new NullAsk(),
    seed,
    onError: (e) => errors.push(`${e.sprite} ${e.event}: ${String(e.error)}`),
  });
  world.load(new Function('rt', r.code) as Program);
  world.start();
  const renderer = new NullRenderer();
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      world.tick();
      renderer.render(world);
    }
  };
  const sprite = (name: string) => world.all.find((s) => s.name === name)!;
  const G = world.globals as Record<string, unknown>;
  return { world, errors, tick, sprite, G, diagnostics: r.diagnostics };
}

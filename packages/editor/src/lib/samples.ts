import { bulletCart } from '../samples/bullet/build';
import { examplesCart } from '../samples/examples/build';
import { parityCart } from '../samples/parity/build';
import { platformerCart } from '../samples/platformer/build';
import { cartFromUrl } from './files';
import { loadSample } from './project';
import { Session, STAGE_FILE } from './session';

/** A sample cart that ships with the editor. */
export interface Sample {
  id: string;
  title: string;
  /** One line for the menu. */
  about: string;
  /** Under `public/`, so it's served with the editor. Built-in samples have none. */
  path?: string;
  /** Built from source instead of loaded from `path`. */
  build?: () => Session;
}

/**
 * The samples in the Cart tab and `?sample=<id>`. Bounce is built from source and is the first
 * cart a new user sees; Examples is generated from the docs registry; Patch Hop, Needle Storm
 * and Scratch Parity are built from their `.stitch` code and the art and sound in their
 * `build.ts`; Stitch Dungeon is a cart made in the editor and saved as `.stitch.png`.
 */
export const SAMPLES: readonly Sample[] = [
  {
    id: 'bounce',
    title: 'Bounce',
    about: 'A sprite to steer with the arrow keys',
    build: loadSample,
  },
  {
    id: 'examples',
    title: 'Examples',
    about: 'Every built-in variable, live, and every kind of variable',
    build: () => fromBuilt(examplesCart()),
  },
  {
    id: 'platformer',
    title: 'Patch Hop',
    about: 'A platformer: three levels, stomping, buttons to collect',
    build: () => fromBuilt(platformerCart()),
  },
  {
    id: 'bullet',
    title: 'Needle Storm',
    about: 'A bullet hell: one boss, three phases of patterns',
    build: () => fromBuilt(bulletCart()),
  },
  {
    id: 'parity',
    title: 'Scratch Parity',
    about: 'Checks Scratch 3 blocks one by one, then demos backdrops, effects and drag',
    build: () => fromBuilt(parityCart()),
  },
  {
    id: 'dungeon',
    title: 'Stitch Dungeon',
    about: 'A roguelike: clones, grids, pen HUD, line of sight',
    path: 'samples/stitch-dungeon.stitch.png',
  },
];

/** A session from a sample's builder, whose Stage code is under `stage`. */
function fromBuilt(b: {
  parts: Parameters<typeof Session.fromSources>[0];
  sources: Record<string, string>;
}) {
  const { stage, ...sprites } = b.sources;
  return Session.fromSources(b.parts, {
    ...sprites,
    ...(stage !== undefined ? { [STAGE_FILE]: stage } : {}),
  });
}

/** Loads a sample by id, relative to the editor's own URL so any host path works. */
export async function openSample(id: string): Promise<Session> {
  const s = SAMPLES.find((x) => x.id === id);
  if (!s) throw new Error(`there's no sample called "${id}"`);
  if (s.build) return s.build();
  if (!s.path) throw new Error(`the sample "${id}" has no source`);
  return Session.fromCart((await cartFromUrl(new URL(s.path, document.baseURI).href)).cart);
}

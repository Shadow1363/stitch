/**
 * The Examples cart, generated from the docs registry when it's opened (Cart → Samples, or
 * `?sample=examples`). An Inspector sprite shows every built-in variable live on the stage, and
 * one sprite per variable kind runs that kind's reference example. New built-in variables and
 * examples in the registry appear here with no change to this file.
 */
import {
  blankImage,
  DEFAULT_PALETTE,
  encodeLayers,
  normalizeStage,
  setPixel,
  type PixelAsset,
  type SpriteInit,
} from '@stitch/cart';
import {
  builtinVariableNames,
  describe,
  docEntry,
  SECTIONS,
  summaryOf,
} from '@stitch/blocks/registry';
import { isSpriteProp } from '@stitch/ir';
import { format } from '@stitch/lang';

/** A filled circle, 16×16, as a costume. Colours are pixel values: palette index + 1 (0 is clear). */
function dot(name: string, colour: number, ring = 0): PixelAsset {
  const img = blankImage(16, 16);
  const px = img.layers[0]!.pixels;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d <= 7.5) setPixel(px, 16, 16, x, y, d > 5.5 && ring ? ring : colour);
    }
  return {
    kind: 'pixel',
    name,
    center: [8, 8],
    width: 16,
    height: 16,
    layers: encodeLayers(img),
  };
}

/** Rows per column of the Inspector's panel, and the panel's layout in stage coordinates. */
const ROWS = 14;
const LEFT = -316;
const COLUMN = 226;
const TOP = 168;
const LINE = 13;

/** Lines of `draw_text` showing each built-in variable, in two columns on the left. */
function inspectorPanel(): string {
  return builtinVariableNames()
    .map((name, i) => {
      const read = isSpriteProp(name) ? name : `${name}()`;
      // Numbers to two decimals, so long fractions fit.
      const value = describe(name)?.returns === 'number' ? `format_number(${read}, 2)` : read;
      const x = LEFT + Math.floor(i / ROWS) * COLUMN;
      return `    draw_text("${read}: " .. ${value}, ${x}, ${TOP - (i % ROWS) * LINE})`;
    })
    .join('\n');
}

function inspector(): string {
  const ask = docEntry('ask')!;
  return `-- Inspector: every built-in variable, live, drawn with the pen.
-- Generated from the docs registry, so new built-in variables show up here by themselves.
on start do
  goto(-100, -120)
  forever do
    turn(2)
    move(1.5)
    if frame_count() % 30 == 0 then
      next_costume()
    end
  end
end

on start do
  set_pen_color("#1d2b53")
  set_pen_size(2)
  forever do
    clear_pen()
${inspectorPanel()}
  end
end

-- ${summaryOf(ask.doc)} Click the Inspector to try it.
on click do
${ask.example.replace(/^/gm, '  ')}
end
`;
}

/** What puts each variable kind on the stage, after its reference example. */
const STAGING: Record<string, string> = {
  'kind-global': `on start do
  forever do
    wait(1)
    broadcast("coin")
    say("score: " .. score)
  end
end`,
  'kind-sprite': `on start do
  create_clone()
  create_clone()
  wait(0.5)
  say("enemies: " .. enemies)
end

on clone do
  hide()
end`,
  'kind-clone': `on start do
  say(hp)
  create_clone()
  create_clone()
end

on clone do
  x += 40 * clone_count()
end`,
};

const kinds = SECTIONS.find((s) => s.id === 'variable-kinds')!.entries;

/** Where each variable-kind sprite stands: two columns on the right of the stage. */
const SPOTS: [number, number][] = [
  [140, 130],
  [250, 130],
  [140, 50],
  [250, 50],
  [140, -30],
  [250, -30],
  [140, -110],
  [250, -110],
];

/** Sprite names from entry ids ("kind-list" → "List"), where the plain word would mislead. */
const NAMES: Record<string, string> = { 'kind-sprite': 'Shared', 'kind-clone': 'PerClone' };
const spriteName = (id: string) =>
  NAMES[id] ?? id.replace(/^kind-/, '').replace(/^./, (c) => c.toUpperCase());

/** The cart's parts and its source text per file, ready for `Session.fromSources`. */
export function examplesCart() {
  const sprites: SpriteInit[] = [];
  const sources: Record<string, string> = {
    stage: `-- The Examples cart: built-in variables (the Inspector) and every kind of variable.
-- Each sprite's code is its example from the language reference, plus a little staging.
`,
  };
  const base = { direction: 90, size: 150, visible: true, costume: 1 };
  sprites.push({
    ...base,
    id: 'inspector',
    name: 'Inspector',
    x: -100,
    y: -120,
    layer: 0,
    costumes: ['ink-a', 'ink-b'],
  });
  sources.inspector = inspector();
  kinds.forEach((k, i) => {
    const [x, y] = SPOTS[i % SPOTS.length]!;
    const id = k.id;
    sprites.push({
      ...base,
      id,
      name: spriteName(id),
      x,
      y,
      layer: i + 1,
      costumes: ['dot'],
    });
    const staging = STAGING[id];
    sources[id] =
      `-- ${k.title}\n-- ${summaryOf(k.doc)}\n${k.example}\n${staging ? `\n${staging}\n` : ''}`;
  });
  for (const [id, text] of Object.entries(sources)) sources[id] = format(text).text;
  const parts = {
    meta: { title: 'Examples' },
    // Wider than Scratch's stage, to fit the panel beside the variable-kind sprites.
    stage: normalizeStage({ width: 640, height: 360, background: '#fff1e8' }),
    sprites,
    palette: DEFAULT_PALETTE.slice(),
    // Blue, then yellow (so `next_costume` shows), with a navy ring; the others are pink.
    assets: {
      'ink-a': dot('inspect', 13, 2),
      'ink-b': dot('inspect blink', 11, 2),
      dot: dot('dot', 15),
    },
    map: undefined,
  };
  return { parts, sources };
}

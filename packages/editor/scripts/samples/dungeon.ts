/**
 * Builds the Stitch Dungeon sample the way a user would: it drives the real editor in headless
 * Chromium, painting each costume and tile pixel by pixel, making sounds from presets and
 * sliders, typing the music into the tracker and the code into the Code view (one block is
 * added in the Blocks view), then saves the cart to public/samples/stitch-dungeon.stitch.png.
 *
 *   node packages/editor/scripts/samples/dungeon.ts
 *
 * Run it again after a language change to rebuild the sample. The game's code is in
 * src/samples/dungeon/*.stitch; `dungeon.test.ts` checks the saved cart against it.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import type * as Playwright from 'playwright';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '../../../..');
const editor = join(root, 'packages/editor');
const out = join(editor, 'public/samples/stitch-dungeon.stitch.png');
const { chromium } = createRequire(join(root, 'package.json'))('playwright') as typeof Playwright;
const code = (name: string) =>
  readFileSync(join(editor, 'src/samples/dungeon', `${name}.stitch`), 'utf8');

// ---- Art: one character per pixel, as palette colours (PICO-8 order) ----

const COLOURS: Record<string, number> = {
  k: 1, // black
  n: 2, // navy
  p: 3, // plum
  g: 4, // dark green
  b: 5, // brown
  d: 6, // dark grey
  l: 7, // light grey
  w: 8, // white
  r: 9, // red
  o: 10, // orange
  y: 11, // yellow
  G: 12, // green
  B: 13, // blue
  v: 14, // lavender
  P: 15, // pink
  s: 16, // peach (skin)
};

const COSTUMES: Record<string, Record<string, string[]>> = {
  Player: {
    player1: [
      '..llll..',
      '.llllll.',
      '.lsksk..',
      '..ssss..',
      '.oBBBBo.',
      '.sBBBBs.',
      '..B..B..',
      '..n..n..',
    ],
    player2: [
      '..llll..',
      '.llllll.',
      '.lsksk..',
      '..ssss..',
      '.oBBBBo.',
      '.sBBBBs.',
      '..B.B...',
      '.n...n..',
    ],
  },
  Enemy: {
    rat: [
      '........',
      '........',
      '....d.d.',
      '..ddddkd',
      '.ddddddP',
      'dddddd..',
      'P.d..d..',
      '........',
    ],
    slime: [
      '........',
      '........',
      '...GG...',
      '..GGGG..',
      '.GkGGkG.',
      '.GGGGGG.',
      'GGGGGGGG',
      '.gggggg.',
    ],
    skeleton: [
      '..www...',
      '.wwwww..',
      '.wkwkw..',
      '..www...',
      '.lwwwl..',
      '..lwl...',
      '..w.w...',
      '.ww.ww..',
    ],
  },
  Potion: {
    potion: [
      '...bb...',
      '...ll...',
      '..lrrl..',
      '.lrrrrl.',
      '.rrwrrr.',
      '.rrrrrr.',
      '..rrrr..',
      '........',
    ],
  },
};

/** Six 8×8 tiles side by side: wall, floor, stairs, then the same three dimmed. */
const TILES = [
  ['lllklllk', 'dddkdddk', 'dddkdddk', 'kkkkkkkk', 'lklllkll', 'dkdddkdd', 'dkdddkdd', 'kkkkkkkk'],
  ['nnnnnnnn', 'nnnnnnpn', 'nnnnnnnn', 'npnnnnnn', 'nnnnnnnn', 'nnnnpnnn', 'nnnnnnnn', 'nnnnnnnn'],
  ['llllllll', 'dddddddd', 'kkllllll', 'kkdddddd', 'kkkkllll', 'kkkkdddd', 'kkkkkkll', 'kkkkkkdd'],
];
const dim = (rows: string[]) =>
  rows.map((r) => [...r].map((c) => ({ l: 'd', d: 'n', n: 'k', p: 'n', k: 'k' })[c] ?? c).join(''));
const TILESET = [...TILES, ...TILES.map(dim)];

// ---- Sounds: a preset to start from, then the sliders ----

const SOUNDS: { name: string; preset: string; wave: string; set: Record<string, number> }[] = [
  {
    name: 'step',
    preset: 'Blip',
    wave: 'square',
    set: {
      Sustain: 0.02,
      Decay: 0.06,
      'Start pitch': 0.22,
      Slide: 0,
      'Square duty': 0.5,
      Volume: 0.2,
    },
  },
  {
    name: 'hit',
    preset: 'Hit',
    wave: 'noise',
    set: { Sustain: 0.03, Decay: 0.16, 'Start pitch': 0.45, Slide: -0.4, Volume: 0.45 },
  },
  {
    name: 'hurt',
    preset: 'Hit',
    wave: 'square',
    set: {
      Sustain: 0.05,
      Decay: 0.22,
      'Start pitch': 0.3,
      Slide: -0.35,
      'Square duty': 0.3,
      Volume: 0.45,
    },
  },
  {
    name: 'pickup',
    preset: 'Powerup',
    wave: 'square',
    set: { Sustain: 0.1, Decay: 0.25, 'Start pitch': 0.35, Slide: 0.25, Volume: 0.4 },
  },
  {
    name: 'stairs',
    preset: 'Jump',
    wave: 'sine',
    set: { Sustain: 0.25, Decay: 0.35, 'Start pitch': 0.5, Slide: -0.2, Volume: 0.45 },
  },
  {
    name: 'death',
    preset: 'Explosion',
    wave: 'noise',
    set: { Sustain: 0.3, Punch: 0.5, Decay: 0.6, 'Start pitch': 0.2, Slide: -0.1, Volume: 0.55 },
  },
];

// ---- Music: notes per row on the tracker's piano keys (octave o: Z–M, octave o+1: Q–U) ----

/** One channel of a 32-row pattern: row -> key. */
interface Part {
  instrument: string;
  octave: number;
  notes: Record<number, string>;
}

// A minor: Am, F, then G, E. Lead in octave 4 (q = C5), bass in octave 2, drum on the beat.
const DRUM: Part = { instrument: 'Drum', octave: 4, notes: { 0: 'z', 8: 'z', 16: 'z', 24: 'z' } };
const PATTERNS: Part[][] = [
  [
    {
      instrument: 'Lead',
      octave: 4,
      notes: {
        0: 'n',
        2: 'q',
        4: 'e',
        6: 'q',
        8: 'n',
        10: 'q',
        12: 'e',
        14: 'w',
        16: 'v',
        18: 'n',
        20: 'q',
        22: 'n',
        24: 'v',
        26: 'n',
        28: 'q',
        30: 'm',
      },
    },
    { instrument: 'Bass', octave: 2, notes: { 0: 'n', 8: 'n', 16: 'v', 24: 'v' } },
    DRUM,
  ],
  [
    {
      instrument: 'Lead',
      octave: 4,
      notes: {
        0: 'b',
        2: 'm',
        4: 'w',
        6: 'm',
        8: 'b',
        10: 'm',
        12: 'w',
        14: 'q',
        16: 'c',
        18: 'h',
        20: 'm',
        22: 'h',
        24: 'c',
        26: 'h',
        28: 'm',
        30: 'w',
      },
    },
    { instrument: 'Bass', octave: 2, notes: { 0: 'b', 8: 'b', 16: 'c', 24: 'c' } },
    DRUM,
  ],
];

// The flash when an enemy is hit is added in the Blocks view, not typed.
const FLASH = '    set_effect("brightness", 80)\n';

// ---- Driving the editor ----

const server = await createServer({
  root: editor,
  configFile: join(editor, 'vite.config.ts'),
  logLevel: 'warn',
  server: { port: 0 },
});
await server.listen();
const browser = await chromium.launch({ channel: 'chromium' });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));

const tab = (name: string) => page.getByRole('tab', { name, exact: true }).click();
const button = (name: string) => page.getByRole('button', { name, exact: true });
const fileTab = (name: string) =>
  page.locator('nav.tabs').getByRole('button', { name, exact: true });
async function dialog(fill?: string) {
  const d = page.locator('dialog[open]');
  await d.waitFor();
  if (fill !== undefined) await d.locator('input').fill(fill);
  await d.locator('button.ok').click();
  await d.waitFor({ state: 'detached' }).catch(() => {});
}
async function setField(label: string, value: string, scope = page.locator('body')) {
  const f = scope.getByLabel(label, { exact: true }).first();
  await f.fill(value);
  await f.press('Tab');
}

/** Paints `rows` into the open pixel editor, one colour at a time, with the pencil. */
async function paint(rows: string[]) {
  const canvas = page.locator('.art-editor canvas').first();
  await button('Pencil').click();
  const box = (await canvas.boundingBox())!;
  const cell = box.width / rows[0]!.length;
  const byColour = new Map<string, [number, number][]>();
  rows.forEach((r, y) =>
    [...r].forEach((c, x) => {
      if (c !== '.') byColour.set(c, [...(byColour.get(c) ?? []), [x, y]]);
    }),
  );
  for (const [c, cells] of byColour) {
    await page.getByRole('button', { name: `colour ${COLOURS[c]}`, exact: true }).click();
    for (const [x, y] of cells)
      await page.mouse.click(box.x + (x + 0.5) * cell, box.y + (y + 0.5) * cell);
  }
}

async function addSprite(name: string) {
  await button('Sprite').click();
  await fileTab('Sprite1').dblclick();
  await dialog(name);
}

try {
  await page.goto(server.resolvedUrls!.local[0]!);
  await page.waitForSelector('.cm-content');

  // 1. A new cart with a PICO-8-style stage: 32×20 cells of 8px plus a 48px HUD.
  await tab('Cart');
  await button('New cart').click();
  await dialog();
  await setField('Title', 'Stitch Dungeon');
  await setField('Width', '256');
  await setField('Height', '208');
  await page.getByLabel('Origin').selectOption({ label: 'top-left' });
  await page.getByLabel('Y axis').selectOption({ label: 'down (screen)' });
  await page.getByLabel('Scaling').selectOption({ label: 'whole numbers only' });
  await page.getByLabel('Filtering').selectOption({ label: 'pixel (everything sharp)' });
  await page.getByLabel('Background').fill('#000000');

  // 2. Sprites and their costumes.
  await tab('Code');
  await fileTab('Sprite1').dblclick();
  await dialog('Player');
  await addSprite('Enemy');
  await addSprite('Potion');
  for (const [sprite, costumes] of Object.entries(COSTUMES)) {
    await tab('Code');
    await fileTab(sprite).click();
    await tab('Costumes');
    await page.getByTitle('New pixel costume size').selectOption('8');
    for (const [name, rows] of Object.entries(costumes)) {
      await button('Pixel').click();
      await setField('Costume name', name);
      await paint(rows);
    }
    // The starter circle goes.
    await page.locator('.strip .frame').first().click();
    await page.getByTitle('Delete costume').click();
  }

  // 3. The tile map and its six tiles.
  await tab('Map');
  await page.getByLabel('Tile size').selectOption({ label: '8px' });
  await button('Create map').click();
  const mapper = page.locator('.mapper');
  await setField('Height', '20', mapper);
  await button('Tile').click();
  await button('Tile').click();
  await button('Edit tileset').click();
  await paint(Array.from({ length: 8 }, (_, y) => TILESET.map((t) => t[y]).join('')));
  await button('Done editing tiles').click();

  // 4. Sound effects.
  await tab('Sounds');
  for (const s of SOUNDS) {
    await page.locator('.new').getByRole('button', { name: s.preset, exact: true }).click();
    await setField('Sound name', s.name);
    await page.getByRole('radio', { name: s.wave, exact: true }).click();
    for (const [label, v] of Object.entries(s.set)) {
      // A slider's label also holds its value ("Sustain 0.30"), so match the name part.
      const slider = page
        .locator('.sliders label')
        .filter({ has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) })
        .locator('input');
      await slider.fill(String(v));
    }
  }

  // 5. Music: one looping song of two patterns.
  await tab('Music');
  await button('Start a song').click();
  await setField('Song name', 'dungeon');
  await setField('BPM', '110');
  await page.locator('.insts').getByRole('button', { name: '01 Lead' }).click();
  for (const [label, v] of [
    ['Decay s', 0.12],
    ['Sustain', 0.25],
    ['Volume', 0.5],
  ] as const)
    await page
      .locator('.inst label.slider')
      .filter({ hasText: new RegExp(`^${label}`) })
      .locator('input')
      .fill(String(v));
  for (let p = 0; p < PATTERNS.length; p++) {
    if (p > 0) await button('New').click();
    for (const [ch, part] of PATTERNS[p]!.entries()) {
      await page
        .locator('.insts li')
        .getByRole('button')
        .filter({ hasText: part.instrument })
        .click();
      await setField('Octave', String(part.octave));
      await page.locator('.grid .row').nth(0).locator('.cell').nth(ch).locator('.f0').click();
      for (let row = 0; row < 32; row++) await page.keyboard.press(part.notes[row] ?? 'ArrowDown');
    }
    if (p > 0) await page.getByTitle('Append the pattern being edited').click();
  }

  // 6. Code, typed into the Text view.
  await tab('Code');
  await button('Text').click();
  const files: [string, string][] = [
    ['Stage', code('stage')],
    ['Player', code('player')],
    ['Enemy', code('enemy').replace(FLASH, '')],
    ['Potion', code('potion')],
  ];
  for (const [file, text] of files) {
    await fileTab(file).click();
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText(text);
    await page.waitForTimeout(500);
  }

  // 7. One block added in the Blocks view: the flash before the enemy's `wait`.
  await fileTab('Enemy').click();
  await button('Blocks').click();
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    type B = {
      type: string;
      getPreviousBlock(): B;
      nextConnection: unknown;
      previousConnection: { connect(c: unknown): void };
      outputConnection: unknown;
      getInput(n: string): { connection: { connect(c: unknown): void } };
      setFieldValue(v: unknown, f: string): void;
      setShadow(s: boolean): void;
      initSvg(): void;
      render(): void;
    };
    const ws = (
      globalThis as unknown as {
        __stitchBlocks: { ws: { getAllBlocks(o: boolean): B[]; newBlock(t: string): B } };
      }
    ).__stitchBlocks.ws;
    const make = (type: string, field: string, value: unknown) => {
      const b = ws.newBlock(type);
      b.setFieldValue(value, field);
      b.setShadow(true);
      b.initSvg();
      b.render();
      return b;
    };
    const wait = ws.getAllBlocks(false).find((b) => b.type === 'stitch_b_wait')!;
    const flash = ws.newBlock('stitch_b_set_effect');
    flash.initSvg();
    flash
      .getInput('ARG0')
      .connection.connect(make('stitch_str', 'TEXT', 'brightness').outputConnection);
    flash.getInput('ARG1').connection.connect(make('stitch_num', 'NUM', 80).outputConnection);
    flash.render();
    flash.previousConnection.connect(wait.getPreviousBlock().nextConnection);
  });
  await page.waitForTimeout(1500);
  await button('Text').click();
  const enemy = await page.evaluate(
    () =>
      (globalThis as unknown as { __stitchSession(): { docs: { name: string; text: string }[] } })
        .__stitchSession()
        .docs.find((d) => d.name === 'Enemy')!.text,
  );
  if (enemy !== code('enemy'))
    throw new Error(`the Blocks edit didn't give enemy.stitch:\n${enemy}`);
  const problems = await page.locator('.panel ul').first().innerText();
  if (!problems.includes('No problems.')) throw new Error(`problems: ${problems}`);

  // 8. Save the cart.
  await tab('Cart');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Save \.stitch\.png/ }).click(),
  ]);
  await dl.saveAs(out);
  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
  console.log(`Saved ${out}`);
} finally {
  await browser.close();
  await server.close();
}

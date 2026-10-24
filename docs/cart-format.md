# Cart format

A cart is one file holding a whole game: code, sprites, art, sounds, music, the tile map and extensions. It is JSON, usually stored inside a PNG whose picture is the game's cover (`.stitch.png`). Reading code: `packages/cart/src/cart.ts` (`normalizeCart`) and `packages/cart/src/png.ts`. This page is the spec; the code is the authority.

Carts hold **sources, not caches**: pixel layers, SVG text and sound parameters rather than rendered images or audio. The editor, the stage and exported players all render them with the same code (`@stitch/cart/render`, `@stitch/cart/audio`).

## The PNG container

A `.stitch.png` is an ordinary PNG. The cart rides in a private ancillary chunk named `stCt`, placed before `IEND`:

| Bytes | Content |
|---|---|
| 1 | Chunk format, currently `1` |
| rest | zlib-compressed UTF-8 JSON of the cart |

Image viewers and most image tools ignore the chunk and show the cover: the stage's starting frame above a title strip. `stCt` is ancillary (`s`), private (`t`), reserved (`C`) and safe to copy (`t`). A plain `.json` file with the same content also opens.

## Versions and migration

The top level has `format: "stitch-cart"` and `version`. The current version is **5** (`CART_VERSION`). Loading runs `normalizeCart`, which rejects other formats and newer versions, migrates older ones one step at a time, and fills every missing field with its default. So a cart only needs the fields it uses.

| Version | Change |
|---|---|
| 1 | PNG assets only (`type: "image/png"`) |
| 2 | Assets gain `kind` (`png`, `pixel`, `svg`); carts gain `palette` |
| 3 | `sounds` and `music` |
| 4 | `extensions` |
| 5 | `stage.cloneLimit` |

The program inside (`project`) has its own version, `irVersion` (currently 2: version 2 added `break`, `continue`, `shared var` and the clone and click events), migrated by `migrateProject` in `@stitch/ir`. Changing the shape of either bumps its version and adds a migration step, and old carts keep opening.

## Top level

| Field | Type | |
|---|---|---|
| `format` | `"stitch-cart"` | |
| `version` | `5` | |
| `meta` | object | `title` (default `"Untitled"`) and optional `author` |
| `stage` | object | [Stage settings](#stage) |
| `project` | object | The program: `irVersion`, the `stage` module and one module per sprite in `sprites` (`id`, `name`, `module`). Each module's `items` are the IR nodes in `packages/ir/src/nodes.ts`, the same tree the [language reference](reference.md) describes |
| `sprites` | array | [Starting state of each sprite](#sprites) |
| `palette` | array of `#rrggbb` | Colours for palette indices 1 and up; index 0 is transparent |
| `assets` | object | [Costumes and tilesets](#assets) by id |
| `map` | object, optional | [Tile map](#map) |
| `sounds` | object | [Sound effects](#sounds) by id |
| `music` | object | [Tracker music](#music) |
| `extensions` | array | [Extensions](#extensions), in load order |
| `editor` | object, optional | [Editor state](#editor-state), not needed to run |

Secrets, network permissions and the user's theme are never in a cart.

## Stage

| Field | Default | |
|---|---|---|
| `width`, `height` | `480`, `360` | Stage size in cart units |
| `origin` | `"center"` | Where (0, 0) is: `"center"` or `"top-left"` |
| `yAxis` | `"up"` | Which way y grows on screen: `"up"` or `"down"` |
| `scaling` | | `mode`: `"fit"` (largest scale that fits) or `"integer"` (whole-number scales only); `filter`: `"smooth"` (each costume's `pixelArt` decides) or `"pixel"` (nearest-neighbour everywhere) |
| `background` | `"#ffffff"` | Stage colour |
| `cloneLimit` | `300` | Most clones alive at once, 0–10000. Making one more is an error ([D25](departures.md)) |

Directions are visual whatever the axes: 0 points up and 90 points right.

## Sprites

| Field | | |
|---|---|---|
| `id` | | Matches the module in `project.sprites` |
| `name` | | Shown on the tab; must be unique |
| `x`, `y` | `0`, `0` | Position, in cart coordinates |
| `direction` | `90` | Degrees |
| `size` | `100` | Percent |
| `visible` | `true` | |
| `layer` | sprite order | Draw order; higher is in front |
| `costumes` | | Asset ids, in costume order |
| `costume` | `1` | Current costume, from 1 |

## Assets

Every asset has a `kind`, a `name` (scripts switch costumes by name) and a `center`: the rotation centre in costume pixels from the top-left.

| `kind` | Fields | |
|---|---|---|
| `"pixel"` | `width`, `height`, `layers` | Pixel art in the cart palette. Each layer has a `name`, `visible` and `data`: base64 of `width × height` bytes, one palette index per pixel. Always drawn as pixel art |
| `"svg"` | `svg` | Vector art as SVG text |
| `"png"` | `data`, `pixelArt` | An imported bitmap as a `data:` URL. `pixelArt` picks nearest-neighbour filtering and whole-pixel placement. URLs are allowed but are inlined when the cart is saved |

## Map

| Field | |
|---|---|
| `tileset` | Asset id of the tileset image, a grid of `tileSize` squares |
| `tileSize` | Pixels per tile |
| `width`, `height` | Size in tiles |
| `tiles` | Base64 of `width × height` little-endian 16-bit cells, row by row. 0 is empty; `t` draws tile `t − 1` of the tileset, counting left to right, top to bottom |

The map is anchored at the stage's top-left corner, whatever the origin.

## Sounds

`sounds` maps an id to `{ kind: "sfx", name, params }`. Scripts play a sound by `name` or by its number in this object's order. `params` is an sfxr parameter set (`SfxParams` in `packages/cart/src/sfx.ts`):

| Field | |
|---|---|
| `wave` | `"square"`, `"saw"`, `"sine"` or `"noise"` |
| `attack`, `sustain`, `punch`, `decay` | Envelope, 0–1 |
| `freq`, `freqLimit`, `slide`, `deltaSlide` | Pitch, its floor and its slide |
| `vibDepth`, `vibSpeed` | Vibrato |
| `arpMod`, `arpSpeed` | Arpeggio: pitch change and when it happens |
| `duty`, `dutySweep` | Square-wave duty cycle |
| `repeatSpeed` | Restarts the pitch envelope; 0 is off |
| `phaserOffset`, `phaserSweep` | Phaser |
| `lpCutoff`, `lpCutoffSweep`, `lpResonance`, `hpCutoff`, `hpCutoffSweep` | Low- and high-pass filters |
| `volume` | 0–1 |

Most are 0–1; slides and sweeps are −1 to 1. Rendering is deterministic: the noise generator is seeded, so a sound is the same every time.

## Music

| Field | |
|---|---|
| `channels` | Channels per pattern (default 4) |
| `instruments` | By id: `name`, `wave` (`"square"`, `"pulse"`, `"triangle"`, `"saw"`, `"sine"`, `"noise"` or `"sample"`, which plays the sound named by `sound` with C-4 as recorded), `attack`, `decay`, `sustain`, `release` (seconds, except `sustain`, a level 0–1) and `volume` (0–1) |
| `patterns` | By id: `name`, `rows`, and `cells`, indexed `[row][channel]`. A cell is `null` or has any of `note` (MIDI number, 60 = C-4, or −1 for note off), `inst` (instrument id), `vol` (0–64) and `fx` (an [effect](reference.md#music-effects) such as `"037"`). Missing fields mean "no change" |
| `songs` | By id: `name`, `bpm` (each row is a sixteenth note), `order` (pattern ids, played in turn) and `loop` |

## Extensions

Each entry has a `manifest`, the validated [manifest](extensions.md#manifest), and `code`, the script's text, so a cart runs without fetching anything. Manifest fields are `id`, `name`, `version`, `description`, `color`, `main` and `blocks`; each block has `name`, `kind`, `label`, `params` (`name`, `type`, `default`), `returns` and `waits`. Entries whose manifest doesn't validate, or whose `id` repeats, are dropped on load.

## Editor state

`editor` has one field, `files`, keyed by file id (`"$stage"` or a sprite id). Each entry has `layout`, block positions by IR node id (`x`, `y`), and `loose`, the scratch-paper blocks that aren't part of the program (Blockly JSON). Players ignore it, and exports leave it out.

## A minimal cart

```json
{
  "format": "stitch-cart",
  "version": 5,
  "meta": { "title": "Hello" },
  "project": {
    "irVersion": 2,
    "stage": { "items": [] },
    "sprites": []
  }
}
```

Everything else takes its default. To write a program by hand, write Stitch text in the editor instead: the IR is easier to produce from text than by hand.

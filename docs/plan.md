# Stitch — Roadmap

A browser-based creative coding environment: a faster Scratch/TurboWarp with PICO-8-style carts. One typed IR is the source of truth. Blocks and text are two editors of it. A compiler turns the IR into JavaScript that runs as generator-based green threads in a sandboxed stage.

Architecture rules, stack and conventions are in [`CLAUDE.md`](../CLAUDE.md). Deliberate differences from Scratch are in [`departures.md`](departures.md).

| Phase | Scope                      | Status                    |
| ----- | -------------------------- | ------------------------- |
| 1     | Language core + runtime    | ✅ Done                   |
| 2     | Blocks                     | ✅ Done                   |
| 3     | Assets and carts           | ✅ Done                   |
| 4     | Audio                      | ✅ Done                   |
| 5     | APIs and extensions        | ✅ Done                   |
| 6     | Export                     | ✅ Done                   |
| 7     | Visual design and branding | ✅ Done                   |
| 8     | Documentation              | ✅ Done                   |
| 9     | Block parity with Scratch 3 | ✅ Done                   |
| 10    | Sample game: Stitch Dungeon | ✅ Done                   |
| 11    | Code editor tooling        | ✅ Done                   |
| 12    | Sample games: Patch Hop and Needle Storm | ✅ Done                   |
| 13    | Editor chrome: docs, icons, pause, full screen | ✅ Done                   |
| 14    | The rest of Scratch 3      | ✅ Done (awaiting review) |
| 15    | Importing Scratch projects (.sb3) | ✅ Done (awaiting review) |
| 16    | Vector point editing, docs diagrams | ✅ Done (awaiting review) |

**Performance targets:** 1,000 moving sprites at 60 fps on a mid-range laptop. Editor first load under 2 s on broadband. Runtime-only export bundle under 500 KB gzipped (172 KB at Phase 6, enforced in CI).

---

## Decisions made

- **Name:** Stitch. Packages are `@stitch/*`, source files are `.stitch`, carts are `.stitch.png`.
- **Round-trip:** canonical plus comments, gofmt-style. `print(parse(t))` is a fixed point and `parse(print(ir)) ≅ ir`. Comments and blank lines are kept; spacing is normalized.
- **Stage:** Scratch defaults (480×360, centre origin, y up, direction 90 = right), stored as per-cart settings. All coordinate conversion goes through `runtime/src/core/space.ts`. Positions are floats, rounded only when drawing pixel art.
- **Sandbox:** the stage runs in an iframe with `sandbox="allow-scripts"` (opaque origin) and talks to the editor through a typed `postMessage` protocol. A Worker was ruled out because audio needs a window.
- **TypeScript 6.0**, not 7: typescript-eslint and svelte-check don't support 7 yet.
- **Fonts:** Inter and JetBrains Mono, self-hosted, SIL OFL-1.1 (approved in Phase 7).

---

## Phase 1 — Language core + runtime ✅

**Done when:** all tests pass, the sample game runs, and the benchmark holds 60 fps. All three are met.

Delivered:

- `@stitch/ir`: AST types with `IR_VERSION`, the builtin catalog (the single registry), validation, serialization.
- `@stitch/lang`: a Lezer grammar for a small Lua-like language, a lowering pass from parse tree to IR, a canonical printer, and CodeMirror support. Unparseable text becomes `Raw` nodes kept byte-for-byte.
- `@stitch/compiler`: IR → JS. Each loop iteration ends in `yield`, `wait` is supported, static types skip coercion, and identical sprite modules are deduplicated.
- `@stitch/runtime`:
  - scheduler, fixed 60 Hz loop and coordinate `Space`
  - Scratch-style value semantics
  - a PixiJS v8 stage (WebGL, or WebGPU via `?renderer=`)
  - the sandbox host and bridge, with a heartbeat watchdog
- Editor: CodeMirror and stage side by side, Run/Stop, problems and console panels, runtime errors that link to source.
- Benchmark (`/bench.html`) on an Apple M2:
  - 1,000 sprites: 60 fps on both WebGL and WebGPU, also inside the sandbox
  - 10,000 sprites: still 60 fps

Differences from the original plan:

- `return` must be the last statement in a block, as in Lua.
- `wait`, `start`, `key` and `message` are contextual keywords.
- Index assignment targets must be `name[...]` chains.
- The planned type-inference file was folded into the compiler's emitter.
- The Vite dev server needed an explicit CORS rule for the `null` origin (R4 was a real problem).
- Headless benchmarks must use `channel: 'chromium'`; the default headless shell stalls on WebGL readback.

## Phase 2 — Blocks ✅

Delivered:

- `@stitch/blocks`: zelos blocks for every IR node and builtin, in Scratch colours.
  - pure JSON converters `toBlocks` / `fromBlocks`
  - a toolbox with live Variables and Functions categories
  - the Blockly glue, loaded lazily (242 KB gzipped)
- **Stable ids:** a block's id is the IR node's id. `reconcile()` carries ids across text re-parses; `carryTextDetails()` keeps blank lines, same-line comments and number spelling across block edits.
- **Two-way sync:** text edits update blocks 300 ms after the last change, or 1.5 s while there are syntax errors. Block edits print back to text. Raw code shows as a raw-code block, and fixing it there turns it back into real blocks.
- **Undo:** one history across both views and all files.
- **Loose blocks** (stacks without a hat) are workspace-only scratch paper, as in Scratch. They are never part of the IR.
- **`warp function`:** no per-iteration yield; functions it calls inherit warp. As in Scratch, it still yields once a tick has run for 500 ms.

Differences from the original plan:

- Variable names and function parameters are typed into text fields rather than picked from dropdowns (D13, D14).
- Blockly's own undo/redo shortcuts are unregistered; the editor handles those keys for both views.
- `autoInstallPeers: false` keeps Blockly's Node-only jsdom peer out of the tree.

## Phase 3 — Assets and carts ✅

Delivered:

- **Cart format v2** (with migration from v1):
  - assets are `png`, `pixel` (palette indices in layers) or `svg` sources, never cached images
  - one palette per cart (index 0 is transparent)
  - an optional tile map
  - per-file editor state: block layout and loose blocks
- `@stitch/cart/render` draws any asset to an image, for both the editor and future exported players.
- `@stitch/cart/png` stores the cart as zlib JSON (fflate) in a private `stCt` chunk of the cover PNG.
- **Pixel editor:** pencil, eraser, fill, line, rectangle, picker and centre tools; palette editing; layers; costumes as animation frames with onion skin; zoom and grid; its own undo.
- **Vector editor** (Paper.js, lazy): select, reshape (Phase 16), pen, rectangle, ellipse, line and centre tools; fill and stroke; SVG import and export; its own undo.
- **Tile map editor:** a starter tileset, painting and resizing, tileset editing in the pixel editor. New builtins `tile_at` / `set_tile` with blocks; the map is anchored at the stage's top-left.
- **Carts:** save as `.stitch.png` (the cover shows the starting frame and the title); open by file, drag-and-drop or `?cart=URL`; autosave to IndexedDB with restore on load.
- **Cart panel:** title, author and every stage setting. Sprites can be added, renamed and deleted.

Differences from the original plan:

- A ~40-line IndexedDB wrapper replaces `idb` while its ISC license awaits approval.
- The art and map editors keep their own undo history while focused, separate from the code history.

---

## Phase 4 — Audio ✅

Delivered:

- **Cart format v3** (with migration from v2): `sounds` (sfxr parameter sets, by id) and `music` (instruments, patterns of rows × channels, songs as pattern orders). `normalizeCart` fills and clamps both.
- `@stitch/cart/audio`: a pure, deterministic renderer for both, used by the editor previews and the stage, and later by exported players:
  - `renderSfx`: an in-house implementation of sfxr's synth (square/saw/sine/noise, 8× supersampling, slides, vibrato, arpeggio, duty sweep, repeat, phaser, filters). Noise is seeded.
  - `renderSong`: a tracker renderer. Rows are sixteenth notes at the song's BPM. Instruments are square, pulse, triangle, saw, sine, noise or a cart sound used as a pitched sample, each with an ADSR envelope. Effects: `0xy` arpeggio, `1xx`/`2xx` slides, `4xy` vibrato, `Axy` volume slide.
  - `encodeWav` (16-bit mono).
- **Effects editor:** presets (coin, laser, explosion, power-up, hit, jump, blip), random, mutate, every parameter as a slider, waveform view, play (Space), WAV export, its own undo.
- **Tracker:** a pattern grid with keyboard note entry (Z–M / Q–U, `1` = note off) plus instrument, volume and effect columns; instruments; a song arranger; play song, play from cursor, play pattern with a moving play row; WAV export; its own undo.
- **Builtins** with a Sound block category: `play_sound`, `play_sound_wait` (yields), `stop_sounds`, `play_music`, `stop_music`, `set_volume`, `volume`. Names or 1-based numbers.
- **Stage audio:**
  - The editor renders sounds and songs, and sends them to the sandbox as transferred `Float32Array`s (`PROTOCOL_VERSION` 2).
  - The stage plays them with Web Audio (`runtime/src/web/audio.ts`); `core/audio.ts` defines `AudioOut` and `NullAudio` for tests.
  - The iframe gets `allow="autoplay"`, so the Run click unlocks audio in the stage. A click or key press in the stage also unlocks it, and the editor shows a hint while audio is still locked.
- **Timing:** `play_sound_wait` waits the rendered length in simulation ticks. The audio itself plays on the audio clock (D15).
- The sample cart has a bounce sound, a stop sound and a looping song.
- Tests:
  - SFX and song buffer determinism, lengths, cursor start and sample instruments (Node)
  - catalog/runtime parity
  - sound builtins run as compiled code
  - a browser test that a gesture starts the AudioContext
  - a 27-check Playwright run with Chrome's real autoplay policy enforced

Differences from the original plan:

- **No Tone.js, and no jsfxr.** Both synths are in-house, pure TS in `@stitch/cart/audio`. Tone.js needs a live AudioContext, so music couldn't be rendered or tested in Node, and it would put a second audio path and its size into the runtime. The in-house renderer gives one deterministic source of truth for editor, stage and export, like `@stitch/cart/render` does for images. jsfxr's Unlicense question goes away; the synth follows sfxr's published algorithm (MIT), written fresh.
- Sounds and songs belong to the cart, not to sprites, and `set_volume` is a master volume (D16).
- Fixed along the way: Run no longer races a pending stage reload, and a stats message between load and run no longer ends "running" early (stats carry `started`).

## Phase 5 — APIs and extensions ✅

Delivered:

- **An extensible catalog** (`ir/src/catalog.ts`): `createCatalog(manifests)` returns core builtins plus extension blocks. Validation, the compiler, `toBlocks`/`fromBlocks`, the toolbox, the Blockly workspace (`setCatalog`) and the linter all take it. The grammar and IR are unchanged; extension blocks are plain calls named `<id>_…`.
- **Data builtins** in a new Data category (D19–D21):
  - `http_get` and `http_post` report the body and wait (via `settle()`, which lets a thread wait on a Promise across ticks); `http_status` reports the sprite's last status.
  - `json_get` follows a dotted, 1-based path; `json_parse` reads JSON. Arrays become lists and objects stay JSON text.
- **HTTP proxy** (`PROTOCOL_VERSION` 3, with `http` / `http-result` messages):
  - The stage's `BridgeNet` forwards requests; the editor's `NetProxy` asks once per host per cart, adds secrets, and fetches (http/https, GET/POST, 10 s timeout, 1 MB cap, 8 at once, no cookies), then scrubs secrets from the reply.
  - Allowed hosts are stored beside the autosave, never in the cart.
  - Production `stage.html` has the CSP `connect-src 'none'`, so the stage can't fetch at all, extension code included.
- **Secrets** (Cart → Network and secrets): stored in the editor's IndexedDB. Each has a name, a value, allowed hosts and an optional header template (`Bearer {value}`), and is used as `{{NAME}}` in a URL or body or added as a header. A secret is never sent to a host it doesn't allow, and requests that carry one don't follow redirects.
- **Secret lint:** a validation warning on string literals that look like keys (provider shapes, or long random tokens).
- **Extensions** (D22, cart format v4 with migration from v3):
  - `cart.extensions` holds validated manifests plus script text.
  - The editor adds them from files or a manifest URL, lists them and removes them; it reads only manifests.
  - The stage runs each script fresh per Run (`core/extensions.ts`) with `stitch.define`, `stitch.log` and `stitch.http`. Blocks marked `waits` may return Promises.
  - Missing or failing implementations explain themselves when called.
  - A sample, Text tools, ships at `/extensions/text/manifest.json`.
- **Docs:** [`network.md`](network.md) (the request path, host permissions, secrets and their limits, CORS, Tauri, exported players), a start on [`reference.md`](reference.md) with the Data builtins and the extension format, and departures D19–D22.
- **Tests:**
  - manifest validation and catalog merging
  - extension blocks round-trip and get their definitions and toolbox category
  - data and extension builtins run as compiled code
  - the cart v3→v4 migration
  - secret injection, refusal and scrubbing, plus the proxy's permissions, limits and errors
  - lint patterns
  - loading the sample from files and from a URL
  - Playwright end to end in real Chromium, 15 checks: an extension loaded by URL, a host prompted once, header and `{{NAME}}` secrets reaching a local CORS API and scrubbed on the way back, extension and data blocks in the toolbox and workspace, and no secrets or grants in the saved cart
  - on the production build: the sample runs at 60 fps under the CSP, and a `fetch` from the stage raises a `connect-src` violation

Differences from the original plan:

- Headers come only from secrets; the HTTP builtins take no headers argument (owner decision).
- Extension code is a plain script body given `stitch`, not an ES module (owner decision): this avoids blob-URL imports in the opaque origin and matches how programs load.
- Extensions live in the cart rather than being loaded by URL at run time, so carts and exports stay self-contained.
- Added beyond the plan: `http_status`, the stage CSP, and `stitch.http` for extensions.

## Phase 6 — Export ✅

Delivered:

- **`@stitch/export`** ([export.md](export.md)):
  - `ExportedGame` (`GAME_VERSION` 1): the cart's sources without IR or editor state, plus the compiled program.
  - Writers for the single HTML page, the PWA file set and the Tauri project, plus `zipFiles` (fflate).
  - `payload.ts` renders sources into the stage's `LoadPayload`; the editor shares its costume rendering.
- **The player:** one classic script (`src/player/main.ts`), **172 KB gzipped** against a 500 KB budget. `pnpm check:size` and a Node test enforce it, and the test also checks that no editor code (Blockly, the parser, secrets) gets in.
  - A start screen whose click unlocks audio, a restart button, an error bar, and an in-page host prompt.
- **`StageRunner`** (`runtime/src/runner.ts`): renderer, audio, input, loop and per-Run worlds, moved out of `host.ts`. The editor's sandboxed stage and exported players now run carts through the same code.
- **`FetchNet`** (`runtime/src/web/fetch-net.ts`): host permission, limits and fetch, moved out of the editor's proxy. `NetProxy` is now `FetchNet` plus a secrets `prepare` step. Players use `FetchNet` with no secrets.
- **Single-file HTML:** runs from disk, with the stage's CSP except `connect-src http: https:`. The game JSON and the player script are escaped so no cart text can close their `<script>` early.
- **PWA zip:** manifest, 192/512 px icons drawn from the stage's starting frame, and a service worker that caches the game cache-first under a content-hashed, per-game cache name. API requests pass through.
- **Tauri 2 desktop template (zip):** Cargo project with `tauri-plugin-http`, a window sized to the stage, and a capability allow-list seeded from the URL literals in the code. The page's CSP adds Tauri's IPC, and the player uses `__TAURI__.http.fetch`. It also includes ICO and PNG icons and a README.
- **Desktop editor** ([`desktop/`](../desktop/README.md)): a Tauri shell around `packages/editor/dist`, whose `NetProxy` fetches through the HTTP plugin (`nativeFetch`).
- **Editor hosting:** builds inline the stage's script into `stage.html` (via the same IIFE build), so the opaque-origin stage loads nothing and hosts need no CORS headers. The stage CSP is now `default-src 'none'`.
- **Export panel** (Cart → Export): HTML, web app and desktop project. A cart with errors refuses to export and names the first error.
- **CI** (`.github/workflows/ci.yml`): typecheck, lint, Prettier (`.ts`), Node tests, licenses, size budget, build and browser tests.
- Fixed along the way: PNG assets given as URLs (the sample's player costume was `/samples/player.png`) broke saved carts opened elsewhere. Saving and exporting now inline them as data URLs, and the sample embeds its PNG.
- **Tests:**
  - Node: export escaping (game text and player code can't break out of `<script>`, including `u`-flag regexes), CSP per target, PWA files and cache naming, Tauri files and allow-list, crate names, ICO layout, zip, `FetchNet` without secrets, and the bundle budget.
  - Playwright on the production build (21 checks): export all three formats from the editor, then:
    - run the HTML file from `file://`: the host prompt, a direct fetch with no secret header, the extension block and 60 fps rendering
    - serve the PWA, check that every file is cached, then reload offline
    - check the Tauri files
    - confirm that no export contains a secret or host grant

    The same run passes on the dev server. The Phase 5 network run (15 checks) still passes after the proxy refactor, and the production stage runs under its stricter CSP with no requests beyond `stage.html`.

Differences from the original plan:

- Only the player gets a real build (an IIFE). Packages still export TS source, because nothing outside the monorepo consumes them yet.
- Exports keep asset and audio sources and render them in the player, instead of shipping pre-rendered images and WAVs. This keeps exports small (595 KB for the sample as HTML, most of it the player) and identical to what the editor shows.
- Players ask for host permission per page load and don't remember the answers.
- The Tauri template and the desktop editor are untested builds: Rust isn't installed on this machine, so the Cargo projects were written to Tauri 2's documented layout but never compiled.

## Phase 7 — Visual design and branding ✅

Delivered:

- **Design tokens** (`packages/editor/src/app.css`, the single token file): brand blue `#1f5be1`; surfaces, text, lines; accent, go, bad, warn; supporting violet, teal and amber; code highlighting; art-editor checkerboard, grid and guide colours; Blockly surfaces; fonts, type sizes, spacing and radii. Light values on `:root`, dark ones on `[data-theme='dark']`. Base styles for buttons, inputs and focus rings live there too, so every panel themes the same way.
- **Contrast and lint check** (`editor/src/tokens.test.ts`):
  - WCAG AA for every text and UI pairing in both themes (4.5:1 text, 3:1 borders and focus rings), including the tinted notice bars and the code colours on the active line and selection.
  - Every colour has a dark value unless it's shared on purpose (brand, letterbox).
  - No hex, `rgb()`, `hsl()`, `white` or `black` in any `.svelte` style block, inline style or canvas `fillStyle`/`strokeStyle`. Art the user makes (default fill, new palette entries) is content and isn't checked.
- **Fonts:** Inter (UI) and JetBrains Mono (code, console, ids), self-hosted from `@fontsource` (SIL OFL-1.1, approved; the license check allows OFL for those two font packages only). Exported players keep system fonts, so an export still loads nothing.
- **Light/dark toggle:** a header button cycles Auto → Light → Dark. Stored in `localStorage` (`stitch.theme`), never in carts. `index.html` resolves it before first paint, and Auto tracks live system changes (`lib/theme.ts`).
- **Theme everywhere:**
  - CodeMirror uses a token-based highlight style and chrome, which closes the "light-only code editor" gap.
  - Blockly's workspace, toolbox and flyout read the tokens and re-theme live (`BlocksWorkspace.setSurfaces`).
  - Canvas UI (pixel grid and checkerboard, map grid and stage outline, tile selection, waveform) reads tokens through `token()` and redraws on a theme change.
  - The stage letterbox is one shared constant (`LETTERBOX` in the runtime), used by the editor, `stage.html`, exported players and PWA manifests.
- **Themed dialogs** (`lib/dialog.svelte.ts`, `Dialogs.svelte`): `ask`, `askText` and `tell` replace every native `confirm`/`prompt`/`alert`, including the network host prompt. They are modal `<dialog>`s, so Escape cancels and focus stays inside. Destructive actions use a red button.
- **Logo** (`lib/logo.ts`): an original "S" sewn in a running stitch on a brand-blue tile, legible at 16×16. There is also a monochrome version (`public/logo-mono.svg`) and an SVG favicon with a 32 px PNG fallback. Further assets:
  - PWA manifest with 192/512 px icons and maskable variants, plus a 180 px Apple touch icon.
  - The desktop app's icons.
  - Cart covers, which now show the logo in the title strip.

  `pnpm --filter @stitch/editor icons` renders them all from `logo.ts`, and `icons.test.ts` fails when they're stale.
- **Blockly palette** (`BLOCK_COLOURS`, [D23](departures.md)): category colours that keep white text at AA. `blocks/src/palette.test.ts` checks contrast, pairwise CIEDE2000 distance (≥ 12) and distance under protanopia, deuteranopia and tritanopia simulation (≥ 5, Machado 2009). `blocks/src/color.ts` holds the colour maths.
- **Exported player:** its shell styles come from `PLAYER_TOKENS`, a copy of the dark tokens it uses, and `export.test.ts` checks their contrast.
- **Tests:** the Node checks above. Playwright on the production build covers the theme toggle (default follows the system, toggle, reload, live system change, Blockly and CodeMirror re-theme, fonts load locally) and Escape on a dialog. The export (21 checks) and network (15 checks) runs pass using the themed dialogs. Screenshots of every section were reviewed in both themes.

Differences from the original plan:

- Spacing tokens exist and are used in new and shared styles (base controls, dialogs, header), but existing components keep most of their pixel paddings. Only colours, fonts and radii were converted everywhere, and only colours are enforced.
- The editor has a web manifest and icons but no service worker, so it installs in Chromium browsers and doesn't work offline. (Exported PWAs do work offline.)
- Extension block colours come from their manifests and aren't checked for contrast.
- Speech bubbles on the stage stay white with dark text in both themes: they're part of the game's picture, like Scratch's.

## Phase 8 — Documentation ✅

Delivered:

- **README:** what Stitch is, light and dark screenshots (taken while following the Scratch tutorial), quick start, the docs table, commands and status.
- **Language reference** (`docs/reference.md`): every keyword, construct, operator and builtin, grouped as in the toolbox, plus raw code and music effects. Each entry shows the text beside its block picture. 86 examples, each rendered from its own text by `pnpm docs:blocks` (`packages/blocks/scripts/docs-blocks.ts`): it parses the example, runs `toBlocks`, renders real Blockly in headless Chromium and writes standalone SVGs to `docs/blocks/`, with computed styles inlined and portable fonts.
- **Cart format spec** (`docs/cart-format.md`): the PNG container, versions and migrations, and every field down to sfxr parameters, pattern cells and editor state.
- **Extension guide** (`docs/extensions.md`): a complete two-block example, the manifest and script APIs, value conversion, limits and exports. The Extensions section of the old reference moved here.
- **Export guide** (`docs/export.md`): rewritten user-first (itch.io, static hosts, installing the web app, building the desktop app, games that use the network: prompts, no secrets, CORS, the desktop allow-list), with the technical notes kept below.
- **Architecture overview** (`docs/architecture.md`): a Mermaid diagram of editor, pure packages and stage, then the IR and sync, catalog, compiler and runtime, sandbox, carts and a package table. It links to `CLAUDE.md` for the rules.
- **Contributor guide** (`CONTRIBUTING.md`): setup, the CI checks, what a change needs, regenerating files. It links to `CLAUDE.md` rather than copying it.
- **Tutorials:** [for Scratch users](tutorials/first-game-scratch.md) (Coin Catcher, blocks first: globals, broadcast, sounds, export) and [for PICO-8 users](tutorials/first-game-pico8.md) (Gem Dash, text first: a 128×128 pixel stage, a tile map with walls and diggable stones, `tile_at`/`set_tile`, saving the cart).
- **API docs:** `pnpm docs:api` runs TypeDoc over every package's `exports` (`typedoc.config.mjs`) into `docs/api/` (git-ignored), with warnings as errors. Added to CI.
- **Docs check** (`packages/blocks/src/docs.test.ts`, in `pnpm test`), in the style of the catalog parity tests. It fails when:
  - a builtin has no `###` entry
  - a grammar keyword is missing from the keyword table
  - a block type appears in no reference example
  - a music effect or a cart field is undocumented (the field list comes from a `Required<Cart>` exemplar, so a new field is a type error until it's added)
  - an example doesn't parse or validate, or its picture is missing or stale (each SVG carries a hash of its example)
  - a relative link or heading anchor in README, CONTRIBUTING or `docs/` is broken

  Examples may declare extension manifests (`<!-- manifest -->`), so guide examples render with their real blocks.
- **Verified from a clean copy:** the working tree, copied without `node_modules`, installs and runs `pnpm dev`. A Playwright run follows both tutorials step by step with the labels they name: new cart, rename, Split view, code, Problems, add sprite, Fill with colour 11, sound presets, PICO-8 stage settings, map creation and painting, Run with key presses, Save, reopen and HTML export. All 17 checks pass. It found and fixed one tutorial error: a new sprite reuses the freed name Sprite1, not Sprite2.

Differences from the original plan:

- The tutorial run types each script as text instead of dragging blocks. Text and blocks are one program, and the Blockly round-trip has its own tests.
- The Coin Catcher run checks that the game plays and ends with a score, but not that a coin is caught, since coins appear at random places.
- "A clean checkout" was a copy of the working tree, because Phases 3–8 aren't committed. The check should be repeated from a real clone once they are.
- The API docs are generated, not committed, and have no source links until the repository has a remote.

---

## Phase 9 — Block parity ✅

An audit of every Scratch 3 block (plus the pen extension) against the catalog, then the gaps filled. The audit table, with each block's form, text form and status, is in the approved plan for this phase. The catalog went from 64 builtins to 157.

Delivered:

- **Language** (`IR_VERSION` 2; version-1 projects load unchanged):
  - `break` and `continue`: cap blocks like `return`. Validation rejects them outside a loop, including in a function body. The compiler labels the loop and its body, so `continue` still reaches the per-iteration `yield`.
  - `shared var`: one value for a sprite and its clones, in a per-family record `P` beside `V` and `G`.
  - `on clone` and `on click` hats.
- **Clones** (`core/world.ts`):
  - `create_clone`, `create_clone_of`, `delete_clone`, `is_clone`, `clone_count`, `clones(name)` and `my_id`.
  - A clone copies its parent's state and variables (lists and dictionaries deep-copied), sits just behind it, and gets its own module instance.
  - Ids are `"Name#k"`, and every block that takes a sprite accepts a name or an id.
  - The scheduler indexes scripts by event, finds a script's thread without scanning, and drops a deleted clone's scripts and threads.
  - `stage.cloneLimit` (default 300, `CART_VERSION` 5, `GAME_VERSION` 2) has a Cart-tab field. Going past it is an error that names the limit ([D25](departures.md)).
- **Pen** (`core/pen.ts` pure, drawn by `PixiRenderer` into a `RenderTexture` between the map and the sprites):
  - Scratch's pen blocks, with colour on Scratch's HSV scales.
  - Line, rectangle (two corners), circle, stamp and clear.
  - `draw_text` in an original 3×5 pixel font.
  - On pixel-filtered stages the texture is one texel per stage pixel. `x`/`y` became accessors so moves with the pen down draw, including inside warp loops.
- **Sensing** (`core/collide.ts`, CPU only, the same in Node, the stage and players):
  - pixel-accurate `touching`, `touching_color`, `color_touching` and `sprite_at`, from costume pixels that the stage decodes lazily;
  - `touching_edge` and `touching_mouse`;
  - mouse position, button and click hats;
  - `key_pressed` (this tick only, versus held);
  - `x_of`/`y_of`/`direction_of`/`costume_of`/`var_of`, `distance_to_sprite` and `delta_time`.
- **Looks and motion:**
  - `think`/`think_for`, `costume_name`;
  - ghost, brightness and colour effects (a colour-matrix filter, attached only while it's non-zero);
  - layer order, rotation style (mirroring);
  - `glide`, `goto_random`, `goto_sprite`, `point_towards_sprite`.
- **Data:**
  - dictionaries (`Dict`, indexed with `d["k"]`, iterated by key; JSON objects now parse to them, D21);
  - grids as lists of rows, with `make_grid`/`cell`/`set_cell`/`grid_width`/`grid_height`/`fill_grid`;
  - `clear` and `index_of`;
  - text: `split`, `join`, `substring`, `upper`, `lower`, `format_number`;
  - maths: `random_int`, `set_seed`, `clamp`, `lerp`, `sign`, `distance`, `angle`, inverse trig, logs and powers;
  - the map by cell: `map_cell`, `set_map_cell`, `map_width`, `map_height`, `tile_size`.
- **Control and debug:**
  - `stop_all` (also deletes clones), `stop_other_scripts`, `change_volume`;
  - `watch` (on-stage monitors in the pixel font, [D29](departures.md)) and `assert`.
- **Blocks:**
  - Every builtin has a label and toolbox defaults.
  - The new Pen category is `#a840a8`. The search over the palette found only magentas that clear AA, ΔE 12 and the CVD checks against the existing colours, and those colours are unchanged.
  - Clones sit in Control (the clone hat has a hat-shaped control-colour style). Text goes in Operators, and grids and dictionaries in Lists.
- **Docs:**
  - 99 new reference entries, each with a rendered block picture (191 examples in all), plus new Clones, Pen, Text and Grids and dictionaries sections;
  - cart format v5;
  - departures D24–D31, and D21 updated.
- **Tests:**
  - Every builtin round-trips text → blocks → text as its own block type (157 cases).
  - The new statements and hats have explicit round-trip cases, and the random-program generators include them.
  - 22 compiled-behaviour tests (`compiler/src/parity.test.ts`) cover clones, the clone limit, pen ops in stage pixels under both y axes, the pixel font, pixel touching, colour sensing, `sprite_at`, just-pressed keys, click hats, data helpers, `glide`, effects and layers.
  - WebGL pixel tests check that the pen draws under sprites, clears, stays crisp at integer scale and stamps, plus ghost blending and watch monitors.
- **Benchmark** (M2, headless Chromium, 1,000 sprites, 10 s):
  - 60.0 fps average throughout.
  - Tick time is 0.68–0.90 ms and render 0.92–1.18 ms per frame.
  - WebGL p95 was 17.8–18.5 ms across runs. The unchanged Phase 8 tree measured 18.0–18.5 ms on the same machine minutes later, so the p95 bar sits on headless frame-pacing noise rather than on Stitch's own work.
  - WebGPU passed with p95 18.0 ms, and the sandboxed stage passed.
  - `bench.html?clones=1` makes the 999 balls with `create_clone`: 60 fps, p95 17.4–18.0 ms.

Deferred at the time, all since done: `ask`/`answer` in Phase 11, and backdrops, sound effects, the four distortion effects, the clock, loudness, username and drag mode in [Phase 14](#phase-14--the-rest-of-scratch-3-).

- backdrops and their hat (the stage had no costumes yet);
- the sound pitch and pan effects;
- `ask`/`answer` (needed a text-input overlay in the stage and players);
- wall-clock date and time (breaks D4's determinism);
- the fisheye, whirl, pixelate and mosaic effects (shader cost at 1,000 sprites);
- loudness, username and drag mode.

## Phase 10 — Sample game: Stitch Dungeon ✅

A small roguelike that ships with the editor (**Cart → Samples**, or `?sample=dungeon`), as a playable example and a showcase of the Phase 9 blocks.

Delivered:

- **The game:**
  - Each floor is generated on a 32×20 tile grid: up to 9 rooms joined by L-shaped corridors. A new layout comes each run, or the same one with `global var seed`.
  - Movement is turn-based on the arrows or WASD (`key_pressed`, with hold-to-repeat), and moving into an enemy is a bump attack.
  - Three enemy kinds (rat, slime, skeleton) are clones of one sprite, with per-clone variables. They chase when in sight and wander otherwise.
  - There are potions, stairs to the next floor, and slow health regeneration.
  - Fog of war: unseen cells are black, cells in sight are lit, remembered ones are dimmed. Sight uses Bresenham line of sight from a function that returns a boolean.
  - A pen-drawn HUD shows the health bar, floor, foes left (`var_of` on a `shared var`), a 3-line message log and a minimap (`clones` plus `var_of` for enemy dots).
  - The game-over screen shows the seed, and R restarts.
  - The code is commented for learners: `packages/editor/src/samples/dungeon/*.stitch`.
- **Made in the editor, the way a user would** (`packages/editor/scripts/samples/dungeon.ts`, Playwright on the real editor):
  - The stage settings are set in the Cart tab.
  - Six 8×8 costumes and a six-tile tileset are painted pixel by pixel with the pencil and palette.
  - Six sound effects come from sfxr presets and sliders.
  - A two-pattern looping song (lead, bass and drum) is typed note by note into the tracker.
  - The code is typed into the Text view, and the enemy's hit flash is added as a block in the Blocks view (the script checks that the text came out identical).
  - It's saved with **Save .stitch.png** to `public/samples/stitch-dungeon.stitch.png` (28 KB).
- **Found while building it, and added:**
  - The map editor's tileset had a fixed 4 tiles, and nothing could resize a pixel image. Now **＋ Tile** and **− Tile** grow or shrink a single-row pixel tileset. − Tile only acts when the last tile is blank and unused. This adds `resizeImage` in `@stitch/cart`.
  - A **Samples** menu replaced the single "Load sample" button.
  - Fixed after review: attacking froze the game. The brightness flash on a hit enemy was the first colour effect any test had rendered, and `PixiRenderer` read `sprite.filters[0]` on a sprite whose `filters` was still undefined, so every frame threw. The fix guards that. A browser pixel test now renders brightness and colour. The frame loop also schedules the next frame before running the current one, and `StageRunner` reports a frame error to the Console once, so a renderer error can't silently stop a game again.
- **Tests:**
  - `dungeon.test.ts` (Node) reads the shipped PNG and checks the following:
    - its code is the `.stitch` sources, which are canonical;
    - it has the art, sounds, song, map and stage the game expects;
    - it compiles and plays. A breadth-first-search bot walks to the stairs through 5 floors, with combat in both directions, using the cart's real pixels for sensing.
  - Further checks: potions heal and disappear, the same seed gives the same floor, and 0 HP leads to game over, then R to a fresh run.
  - In the editor (Playwright):
    - `?sample=dungeon` opens with no problems;
    - it plays with no errors;
    - **Open file…** reopens the saved cart;
    - **Export → HTML file** runs from `file://` and plays.

  Screenshots of play, game over and restart were reviewed.

Known limits:

- The cart's cover is the stage's first frame, which is black: the dungeon is drawn once the game runs.
- `x`, `y` and `size` are sprite properties, so grid code uses `col` and `row`. A comment directly above an item merges with a section comment above it, by the printer's canonical layout, so section headings sit right on the first item's comment.

## Phase 11 — Code editor tooling ✅

Delivered:

- **One registry** ([CLAUDE.md](../CLAUDE.md) rule 13): the catalog, block labels and a new docs registry (`@stitch/blocks/registry`, data in `blocks/src/reference/*.ts`) feed blocks, completions, signature help, hover docs, the reference and the Examples cart.
  - The registry holds every `###` entry of the reference: prose, example and picture alt text, plus a scope for built-in variables and a snippet with tab stops for constructs. The prose moved there from `reference.md` word for word.
  - `pnpm docs:reference` writes the reference's `<!-- generated -->` regions; the docs check fails when they're stale. Builtin headings now use the catalog's parameter names (`abs(x)`, not `abs(n)`).
  - Catalog parameters that name things carry a `ref` (sprite, costume, sound, song, message, key, effect, rotation style). Extension blocks may have a `description`.
  - New reference sections: **Variable kinds** (global, shared, per clone, local, list, grid, dictionary, a function that returns a value) and **Built-in variables** (a table of type, scope and access, plus an entry for each sprite property).
- **New builtins:** `ask` / `answer` (deferred in Phase 9), `stage_width`, `stage_height` and `frame_count` ([D32](departures.md)).
  - `ask` waits through `settle()`. Questions take turns in the order asked; a visible sprite asks in its bubble.
  - `core/ask.ts` defines `AskOut` (`NullAsk` in tests). `web/ask.ts` is the answer field over the bottom of the stage, wired in `StageRunner`, so the editor stage and players share it. It's not a `<form>`, because the sandbox has no `allow-forms`.
  - Keys typed into the field don't start key hats.
- **Formatter** (`lang/src/format.ts`): parse, a trivia-only pass (a blank line around each script and function), then the canonical printer.
  - Property tests check that the program and the compiled JS don't change, and that formatting is idempotent. A scrambled copy of Stitch Dungeon formats back to the same compiled code.
  - **Format** button and ⇧⌥F, one undo step.
  - Cmd/Ctrl+S saves the cart, formatting first when *Format on save* is on. The new ⚙ menu holds that and *Link scrolling*; it's per user in localStorage.
- **Language assist** (`@stitch/lang/assist`, pure, on the error-tolerant Lezer tree, plus `editor/src/lib/assist.ts` and `assist-view.ts`):
  - completions by context: declarations at the top level; statements and commands at a line start; reporters and names in expressions; event names after `on`; cart names inside string arguments by `ref`, keys and messages in event strings;
  - names in scope (locals, loop variables, parameters, the file's variables and functions, other files' globals);
  - builtins insert as snippets with a tab stop per parameter, and block-text words find blocks ("pick" offers `random`);
  - signature help with the current parameter, and hover docs with signature, block-coloured block text, type, scope, access, prose and example;
  - go to definition with F12 or ⌘-click, across files for globals.
- **Lint:** warnings for unknown sprite, costume, sound and song names and for broadcasts nobody receives (`CartNames`, `FileContext`). Quick fixes are data on `Diagnostic.fixes`, applied by CodeMirror actions: did-you-mean renames (with transpositions as one edit), declare a variable, fill in or drop arguments. The Problems panel gets the same warnings through `compile()`.
- **Split view** (`lib/split.ts` pure, `Sash.svelte`, `SplitPane.svelte`):
  - sashes between blocks and code, the editor and the stage column, the stage and Problems, the sound list, the pixel editor's palette and the tracker's instruments;
  - drag; a pane snaps closed past half its minimum and reopens when dragged back; double-click for 50/50;
  - focusable separators with arrows, Shift+arrows, Home, End and Enter;
  - hover highlight, resize cursors, and a pointer shield over iframes while dragging.
  - View modes are the code split with a pane closed: ⌘⌥1/2/3 and the buttons, and ⌘⌥O stacks or unstacks blocks and code.
  - Every split, the orientation and so the view mode are saved per cart title in IndexedDB (`lib/layout.ts`), falling back to the last layout used. They replace localStorage `stitch.view`, which is migrated once.
- **Linked views:** moving the cursor in the code glows the innermost matching block and scrolls it into view. Selecting a block marks its lines (the new `--code-linked` token). With *Link scrolling*, scrolling either view follows in the other. Only user input in the blocks view triggers linking, because Blockly also selects and scrolls by itself.
- **Examples cart** (**Cart → Samples → Examples**, `?sample=examples`), generated at load time from the registry:
  - an Inspector sprite that draws every built-in variable live with the pen, and answers `ask` on click;
  - one sprite per variable kind running its reference example verbatim, on a 640×360 stage.
- **Tests:**
  - Node: registry completeness, snippets and `describe`; the generated reference; formatter properties and fixed cases; assist context and scope; completions, signatures and hovers; cart-name lint and fixes; split maths; layout parsing; span lookup; the Examples cart running 300 ticks with a click and an answer; `ask` behaviour (turns, bubble or prompt, Stop).
  - Browser: the answer field (Enter, ✓, cancel) and block highlighting.
  - Playwright on the dev server: completions, signature help and hover. The split view (14 checks, including a reload). Linked selection and scrolling.
  - Playwright on the production build: `ask` in the sandboxed stage and in an exported HTML file, with no CSP violations.

Differences from the plan:

- The **Text** view button keeps its name rather than becoming "Code": the tutorials say "Open **Code**, choose **Text**", and two "Code" buttons side by side would be ambiguous.
- Built-in variables that are reporters keep their entries in their own sections; the new section's table links to them, and only the sprite properties got new entries.
- The cart-name checks are warnings, not errors, so a misspelt sound name doesn't stop a game from running.
- Block-text matching works on the first words of a block (typing "pick" finds `random`), because completion matches one identifier at a time.

Known gaps:

- Stopping a single script (`stop`, `stop_other_scripts`, deleting a clone) while its question is open leaves the field open; answering it lets the queue continue. Stop and Run close it.
- Completion and lint read only string literals for cart names. A name built at run time isn't checked.
- Layouts are keyed by cart title, so two carts with the same title share one.
- The Examples cart's panel uses the pen's pixel font, which is small on a narrow stage column; widening the stage pane helps.

## Phase 12 — Sample games: Patch Hop and Needle Storm ✅

Two more games in **Cart → Samples**, commented for learners like Stitch Dungeon.

- **Patch Hop** (`?sample=platformer`): a single-screen platformer in three levels on a 256×160 pixel stage.
  - Run, jump (hold for higher, coyote time), stomp Snips (walking scissors, as clones), collect buttons. Pits, spikes and Snips cost lives, and the flag ends the level.
  - Collision is pixel-stepped against the tile map.
  - The levels are text grids in the Stage file, one `push` per row, built into the map with `set_map_cell`, so they're easy to edit.
- **Needle Storm** (`?sample=bullet`): a bullet hell on a 192×256 stage against The Spool, in three phases (spiral; rings and aimed needles; curling petals).
  - Bullets are clones made by the Bullet sprite from a queue the Boss fills. Each checks its distance to the hit dot.
  - The player has focus mode, three lives with a safe period, and a drifting starfield.
- **Built from source** like Examples: the code is in `src/samples/platformer/*.stitch` and `src/samples/bullet/*.stitch`. The art, sounds and music are data in each `build.ts`, using `src/samples/kit.ts` (pixel art written as letters, tilesets, sfxr presets, a compact tracker notation).
- **Tests:**
  - `platformer.test.ts`: canonical code with no problems; a bot that runs right and jumps at walls, pits, spikes and Snips finishes all three levels without losing a life; pits end the game after three lives and R restarts; stomping, and side contact costing a life.
  - `bullet.test.ts`: canonical code; standing still leads to game over, and R restarts; a bot that stays under the boss and shoots beats all three phases with the bullet count well inside the clone limit.
  - `lib/samples.test.ts`: every built sample opens through the Samples list with its own Stage code and no errors. It caught a real bug: built samples put their Stage code under `stage` rather than `$stage`, so the Examples cart's Stage comment was silently dropped.

Differences from Stitch Dungeon's approach:

- These two aren't made by driving the editor and saved as `.stitch.png`. They're built from source when opened, which keeps their art, sound and music reviewable as text.

Known gaps:

- The platformer's levels are single screens: the map is anchored to the stage, so there's no scrolling camera.
- Needle Storm's bot doesn't dodge (the test gives it extra lives), so fairness is judged by pattern density rather than proven by play. A non-dodging bot took 27 hits over a 105 s fight with the original 900 HP. HP is now 600.

## Phase 13 — Editor chrome: docs, icons, pause, full screen ✅

- **Docs in the editor** (`docs.html`, `editor/src/docs/`): every markdown file under `docs/` plus the README and CONTRIBUTING, with their pictures, bundled at build time and rendered with `marked`.
  - A sidebar groups the pages (Start, Reference, Project).
  - Links between pages, anchors and block pictures resolve to the bundled copies. Links into source code show as plain text, since the code isn't bundled.
  - The header's **Docs** button opens the reference in a new tab. Every hover and completion entry in the code editor has an **Open in the reference** link to its own entry.
  - `pages.test.ts` checks that every page and link resolves.
- **Pause** between Run and Stop: ticks and sound stop, the picture stays, keys pressed meanwhile are ignored, and Resume carries on from the same tick.
  - `Loop.paused`, `StageRunner.setPaused`, a new `pause` message (`PROTOCOL_VERSION` 4).
  - Checked in the browser: the tick count printed before and after a pause continues without a gap.
- **Full-screen stage:** a button on the stage frame (Esc leaves). The game keeps the keyboard.
- **Icons:** every emoji or symbol used as an icon is now a lucide icon (ISC): `@lucide/svelte` across the editor, `lucide` for the player's restart and dismiss buttons (+0.4 KB gzipped). Icon-only buttons have `aria-label`s. Tutorials, README and the dungeon build script use the plain labels.
- The header got tighter to fit on one line: the theme button is icon-only, and the status text truncates first.

Known gaps:

- The docs page renders the architecture page's Mermaid diagram as code.
- Docs pages reload on each link (no client-side routing).

## Phase 14 — The rest of Scratch 3 ✅

A second audit of every Scratch 3 block (plus Pen) against the catalog found ten gaps left after Phase 9. All are closed; the catalog went from 154 builtins to 176.

| # | Scratch block(s) | Stitch |
|---|---|---|
| G1 | glide to random / mouse / sprite | `glide_to(seconds, sprite)` |
| G2 | letter _ of _ | `letter_of(i, text)` |
| G3 | (size) of (sprite) | `size_of(sprite)` |
| G4 | when (timer / loudness) > _ | `on timer > n` and `on loudness > n` hats |
| G5 | set pen (color) to, change/set pen saturation and brightness | `set_pen_hue`, `set_/change_pen_saturation`, `set_/change_pen_brightness` |
| G6 | hide variable / hide list | `unwatch(label)` |
| G7 | switch backdrop (and wait), next backdrop, backdrop # / name, when backdrop switches to | `backdrop`, `backdrop_wait`, `next_backdrop`, `backdrop_number`, `backdrop_name`, `on backdrop "b"` |
| G8 | sound effects pitch and pan, clear sound effects | `set_sound_effect`, `change_sound_effect`, `clear_sound_effects` |
| G9 | fisheye, whirl, pixelate, mosaic | new names for `set_effect` / `change_effect` |
| G10 | current (year…second), days since 2000, loudness, username, set drag mode | `current(unit)`, `days_since_2000()`, `loudness()`, `username()`, `set_drag_mode(draggable)` |

Delivered:

- **Language** (`IR_VERSION` 3; older projects load unchanged): `on timer > n`, `on loudness > n` (one `greater` event) and `on backdrop "b"`. Edge-triggered hats fire once each time the value rises past `n`, without restarting a run that's still going (`Scheduler.checkEdges`).
- **Backdrops** (`CART_VERSION` 6, `PROTOCOL_VERSION` 5, `GAME_VERSION` 3):
  - `cart.backdrops` and `cart.backdrop`. The stage sprite carries them as its costumes, centred on the stage, so switching, drawing, the cover picture and colour sensing reuse the costume code (D27 updated: colour sensing now sees the backdrop).
  - The renderer draws the backdrop between the background colour and the map.
  - The Costumes tab edits backdrops when the Stage file is selected; new pixel and vector backdrops are stage-sized.
  - `"next backdrop"`, `"previous backdrop"` and `"random backdrop"` as in Scratch's menu; the name is completed and linted (`ref: 'backdrop'`).
- **Effects:**
  - Sound: per-sprite pitch and pan, applied to the sprite's playing sounds too. `play_sound`/`play_sound_wait` now take the sprite; Web Audio uses the playback rate (`2^(pitch/120)`) and a `StereoPannerNode` only for panned voices. `play_sound_wait` waits the pitched length.
  - Graphic: fisheye, whirl, pixelate and mosaic with scratch-render's uniforms and `EffectTransform` maths (`core/effects.ts`). Instead of shaders, the renderer draws a distorted copy of the costume from the same CPU function pixel touching uses, made only when the costume or the values change. So drawing and touching always agree, on WebGL and WebGPU alike, and sprites without these effects cost nothing (the 1,000-sprite benchmark never touches it).
- **Real-world sensing:**
  - `current(unit)` and `days_since_2000()` read a wall-clock sample taken at the start of each tick (`WorldOptions.clock`, D33).
  - `loudness()`: the editor asks before opening the microphone, only for a cart whose code uses loudness, and sends the level (Scratch's smoothing and curve, `micLevel`) to the stage each frame with a new `loudness` message; players open the microphone in their own page after the start click (`@stitch/runtime/mic`, D34). -1 without a microphone.
  - `username()` is `""`, Scratch's value when signed out.
  - `set_drag_mode`: pressing a draggable sprite drags it with the pointer and brings it to the front, in the editor and players alike (D35).
- **Sample:** **Scratch Parity** (`?sample=parity`): a Checker sprite runs 36 checks of Scratch behaviour (operators, lists, motion, backdrops and their hats, clones, sensing, the timer hat) and prints PASS or FAIL for each, with totals on stage; then a demo of backdrops, the distortion effects, sound effects, drag mode, the pen's colour controls and the clock. `parity.test.ts` runs it and wants no FAIL.
- **`stamp`** now draws the sprite's colour, brightness and distortion effects too (the stamp op carries the effects; the renderer makes the bent texture and colour filter for that one stamp).
- **Benchmark** (M2, headless Chromium, 1,000 sprites): WebGL 60.0 fps, p95 17.8 ms; sandboxed WebGL 60 fps; WebGPU 60 fps with p95 18.3, 18.2 and 17.9 ms over three runs, the same headless frame-pacing noise as Phase 9 (about 2 ms of work per frame).
- **Tests:** 12 new compiled-behaviour tests in `parity.test.ts`, unit tests for the distortion maths, pitch and loudness (`effects.test.ts`) and the cart v6 migration, and WebGL pixel tests for the backdrop mosaic and stamped effects (`backdrop.browser.test.ts`). The player is 188.1 KB gzipped.

Known gaps:

- Distorted costumes are sampled nearest-neighbour (as touching is), where Scratch smooths non-pixel-art costumes on the GPU.
- The editor keeps the microphone open until Stop, not just while scripts run: an `on loudness >` or `on key` hat can start one at any time.

## Phase 15 — Importing Scratch projects (.sb3) ✅

Opening a Scratch 3 project gives an ordinary cart: sprites, stage, costumes, backdrops, sounds, variables, lists, custom blocks and scripts, as canonical Stitch code. What maps to what is in [`import-scratch.md`](import-scratch.md).

Delivered:

- **Recorded sounds** (`CART_VERSION` 7): a sound is now `kind: 'sfx'` or `kind: 'sample'` (mono 16-bit PCM, base64, at most 48 kHz). `soundPcm` in `@stitch/cart/audio` gives either kind as samples at its own rate. The stage, players, export and the tracker's sample instruments all go through it, so recordings also work as instruments. `@stitch/cart` gained pure WAV decoding (PCM 8/16/24/32-bit, float and IMA ADPCM, which Scratch records and browsers can't decode) and resampling. In the Sounds tab, a recording shows its waveform and rate, with play, rename, export WAV and delete. `PROTOCOL_VERSION` and `GAME_VERSION` are unchanged, since clips already carried their rate.
- **`@stitch/sb3`** (pure, editor-only, nothing added to the player):
  - Unzips the project, then claims identifiers for every variable, list, custom block and input, so any script can refer to any of them.
  - Converts each script to IR: one switch for statements and one for reporters, with menus, Scratch's compact primitives and covered shadows handled.
  - Prints and re-parses the result, so an imported cart is exactly what the editor would hold.
  - Merges sounds into one bank (D36) and keeps Scratch comments, visible monitors (as `watch` loops), drag mode and rotation style.
  - `HANDLED` covers every Scratch 3 core and Pen opcode except 18 hidden or Scratch 2 ones. Those are listed with reasons in `opcodes.test.ts` and the docs.
  - Anything else becomes a `-- sb3: <opcode>` comment in place and is counted in the report.
- **Editor:** `cartFromBytes` sends zips to the importer. **Open file…**, drag and drop, and `?cart=` all accept `.sb3`. The editor supplies MP3 decoding (`OfflineAudioContext`) and the half-size scaling of Scratch's double-resolution bitmaps (`lib/scratch.ts`). A dialog after the import lists unsupported blocks, renames, skipped loose blocks and notes.
- **Docs:** [`import-scratch.md`](import-scratch.md) (in the Docs sidebar), D36, cart format v7, and links from the README and the Scratch tutorial.
- **Tests:** 13 importer tests:
  - a hand-built project run on `World` (variables, lists, loops, a warp custom block, broadcast-and-wait and a clone give Scratch's values);
  - canonical text;
  - name rules;
  - `var_of` across sprites;
  - unsupported blocks becoming comments;
  - comments, monitors, drag mode and menus;
  - sound merging and costumes;
  - a project using every mapped opcode, which validates and compiles.

  Also unit tests for WAV/ADPCM decoding, resampling and `soundPcm`, a song using a recording as an instrument, and the cart v7 migration. Node tests: 582. The player is 188.3 KB gzipped.
- **Real projects:** three `.sb3` games (19, 9 and 8 sprites; up to 665 costumes) import with zero validation errors and compile. One, an RPG, was checked end to end in the editor and runs. Its MP3 music decodes, it survives a save and reopen as `.stitch.png`, and its HTML export plays.

Known gaps:

- Recordings are stored as plain PCM, so a cart with long music is large: the RPG's 111-second theme at 48 kHz makes a 13 MB cart. Storing at 22.05 kHz, or keeping the MP3 bytes and decoding them in players, would shrink it.
- Hats fired in a tick start on the next one (D6). So a project that creates a clone, waits 0 and then changes a variable the clone reads can behave differently; the RPG's HP counter is one example.
- SVG costumes that use Scratch's own fonts fall back to browser fonts.
- Extensions other than Pen (Music, Text to Speech, Translate, Video Sensing, TurboWarp's) aren't converted.

## Phase 16 — Vector point editing and docs diagrams ✅

- **Reshape tool** (`A`) in the vector editor, like Scratch's:
  - Clicking a shape shows its points: hollow squares, filled once selected, with the selected points' handles.
  - Dragging a point moves it, and Shift-click selects several, which move together. Dragging the shape moves it.
  - Clicking the outline adds a point there.
  - Dragging a handle bends the curve. A smooth point keeps its two handles in line; hold Alt to break them apart.
  - **Curved** and **Pointed** smooth the selected points or make them corners.
  - Delete removes the selected points, and a shape left with too few points goes too.
  - Compound paths and shapes inside imported groups work the same way. Every change is one undo step.
- **Diagrams on the docs site:** ```` ```mermaid ```` fences showed as code in `docs.html`, which renders markdown with `marked`; only GitHub drew them.
  - `pnpm docs:diagrams` renders each fence with Mermaid in headless Chromium to `docs/diagrams/<hash>-light.svg` and `-dark.svg`, with SVG labels so they work as images. `pages.ts` swaps the fence for the picture matching the theme, linked to its full-size file.
  - Mermaid is a dev dependency only, so nothing new ships, and the docs check fails when a picture is missing or stale.

Known gaps:

- The vector editor has no text tool, so imported text can be moved and restyled but not retyped.
- Reshape has no box selection; Shift-click picks several points.

## Open decisions (owner)

1. Approve the Scratch departures D1–D36 in `departures.md` (D36, merging each sprite's sounds into the cart's bank on import, is new in Phase 15; D33–D35, the clock sampled per tick, the editor-proxied microphone and drag mode everywhere, are new in Phase 14; D32, `ask`'s answer field and `frame_count`, in Phase 11). D24–D31 are new in Phase 9: pen shapes and layer, the clone-limit error, `shared var`, CPU-only colour sensing, fixed `delta_time`, `watch` monitors, `break`/`continue`/dictionaries and the pixel font. D21 changed: JSON objects now become dictionaries.
2. License approvals:
   - dev-only exceptions `lightningcss` (MPL-2.0), `minimatch` (BlueOak-1.0.0) and `argparse` (Python-2.0, via TypeDoc for the API docs), plus Mermaid's `elkjs` (EPL-2.0), `robust-predicates` (Unlicense) and `khroma` (MIT, unlabelled) for `pnpm docs:diagrams` (Phase 16)
   - `idb` (ISC), or keep the in-house wrapper
3. Audio engine: Phase 4 replaced Tone.js and jsfxr with an in-house renderer (reasons above). Confirm, or say if you want Tone.js back for live instruments.
4. Default renderer: WebGL (current) or WebGPU. Both hold 60 fps at 1,000 sprites on the M2.
5. Dev CORS rule: allowing the `null` origin means any site's sandboxed iframe can load dev modules while the dev server runs. Builds no longer need it (the stage script is inlined). Dev could do the same with `buildIife`, at the cost of stage hot reload.
6. Install Rust here (or in CI) so the Tauri template and the desktop editor can be built and tested.

## Known gaps

- Top-level syntax errors read as a bare "unexpected 'x'" with no hint about where statements belong.
- The watchdog only rescues the editor if the browser runs the sandboxed iframe in its own process.
- Prettier doesn't format `.svelte` files (no Svelte plugin installed).
- Deleting a sprite can't be undone.
- Benchmarks still need a run on a mid-range (non-M-series) laptop.
- Songs render on the editor's main thread when the stage reloads (cached per source). Long songs can stall a reload briefly; a Worker would fix that.
- Previews in the tracker play once, even for looping songs.
- Deleting or renaming a sound isn't in the effect editor's undo history.
- Recorded sounds can only come from a Scratch import; the Sounds tab can't import a WAV or MP3 on its own or edit a recording beyond renaming.
- A host prompt can appear after Stop for a request made just before it.
- The stage CSP applies only to builds; under `pnpm dev` the stage can still fetch.
- Extension code shares the stage window: it can't reach the editor, secrets or the `World`, but it can post spoofed `log`/`error` messages or draw over the stage. HTTP it sends still goes through the host prompt and secret host rules.
- Extension blocks are plain commands and reporters: no hats, dropdown menus or custom shapes yet.
- The Tauri template and desktop editor have never been compiled (no Rust toolchain here). Unverified: that the HTTP plugin's `fetch` handles the player's `AbortSignal` and streamed body as expected, and that the editor's sandboxed stage iframe works under the `tauri://` origin.
- Exported players render songs on the main thread at start-up (behind "Loading…"), as the editor does on reload.
- CI runs on GitHub (`Shadow1363/stitch`), but the latest runs on `main` fail.
- `touching_color` doesn't see the pen layer (D27).
- Costume pixels for touching are decoded on first use, so the first touching test against a large costume costs a few milliseconds.
- The p95 frame-time bar (≤ 18 ms) is at the level of headless Chromium's own frame-pacing noise on the M2, so single runs can fail it while doing under 2 ms of work per frame. A run on real hardware with vsync would be a better judge.

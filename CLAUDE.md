# Stitch

Browser creative-coding environment: a faster Scratch/TurboWarp with PICO-8-style carts. One typed IR is the source of truth; text and blocks are two editors of it; a compiler turns IR into JS that runs as green threads in a sandboxed stage.

The phase plan, what's done, open owner decisions and known gaps are in `docs/plan.md`. Read it before starting a phase, and update it when a phase lands.

## Architecture rules

1. **IR is the source of truth** (`packages/ir`). Every other representation is derived from it. Shape changes bump `IR_VERSION` and add a step to `migrateProject`. The same rule applies to `CART_VERSION` (`packages/cart`), `PROTOCOL_VERSION` (`packages/runtime/src/protocol.ts`) and `GAME_VERSION` (`packages/export/src/game.ts`).
2. **Text ↔ IR is canonical and lossless.** `print(parse(t))` is a fixed point, and `parse(print(ir)) ≅ ir` (`irEqual` ignores ids). Comments and blank lines live in `Trivia`. Unparseable text becomes a `Raw` node holding its exact text. Each construct has one spelling, so it maps 1:1 to a block.
3. **Side tables hold positional data.** Source spans come back from `parse()` as a `Map<NodeId, Span>`; block positions live in `SourceDoc.layout`. IR nodes carry only meaning.
4. **Blocks are a 1:1 view of the IR** (`packages/blocks`):
   - A Blockly block id is the IR node id. Sub-nodes that share a block (assignment targets, a call statement's call, else-if branches) get ids derived from the block id.
   - Text re-parses get fresh ids, and `reconcile(old, new)` carries the old ids over, so blocks keep identity and position.
   - `toBlocks`/`fromBlocks` are pure JSON converters, tested in Node. Blockly itself is only touched in `workspace.ts`, which loads lazily.
   - Every IR shape has a block. When a builtin block can't represent a call (wrong arity, reporter used as a statement), it falls back to the generic `call` block.
   - Loose blocks (stacks without a hat, stray reporters) are workspace-only scratch paper. They are not IR and don't appear in text.
5. **Sync lives in `editor/src/lib/doc.ts`:**
   - Text edit → parse → reconcile.
   - Block edit → `fromBlocks` → `carryTextDetails` (blank lines, same-line comments, number spelling) → print → re-parse, so both views always hold one canonical program.
   - One `History` serves both views and all files. CodeMirror's and Blockly's own undo stacks are off.
   - The pixel, vector, map, effect and tracker editors keep their own undo while focused (`.art-editor` / `.mapper` opt out of the global Cmd+Z).
   - `editor/src/lib/session.ts` holds the whole cart being edited; `toCart()` / `fromCart()` are the only way in and out. Session data is plain mutable objects, and the UI re-derives from a `version` counter. Anything rendered from data mutated in place must derive a fresh value (an array copy or view objects), or Svelte won't redraw it.
6. **Carts hold sources, not caches** (`packages/cart`, `CART_VERSION` 5):
   - Assets are `png`, `pixel` (palette indices per layer, base64) or `svg`. Palette index 0 is transparent.
   - `@stitch/cart/render` turns any asset into an image, so the editor and exported players draw from the same sources.
   - `cart.sounds` holds sfxr parameter sets and `cart.music` holds instruments, patterns and songs. `@stitch/cart/audio` renders both to samples, purely and deterministically (seeded noise), for the editor, the stage and export alike. Sounds and songs belong to the cart, and scripts name them.
   - `@stitch/cart/png` stores the cart as zlib JSON in a private `stCt` chunk of the cover PNG.
   - The tile map (`cart.map`) is anchored at the stage's top-left. `tile_at` / `set_tile` reach it through `Space`.
   - `cart.extensions` holds extensions: a validated manifest plus the script as text, so carts run without fetching code.
   - `cart.editor` keeps block layout and loose blocks per file. Running a cart never needs it.
   - Secrets and network permissions are never cart data (see rule 11).
7. **The builtin catalog is the single registry** (`packages/ir/src/builtins.ts`). To add a builtin: catalog entry, then runtime impl in `runtime/src/core/builtins.ts` (a test enforces 1:1 and the `yields` flag), then a label in `blocks/src/labels.ts` (a test checks the `%n` slots), then a docs entry in `blocks/src/reference/<section>.ts` (rule 13), then `pnpm docs:reference` and `pnpm docs:blocks`. The grammar and IR stay unchanged.
   - A parameter that names something (a sprite, costume, sound, song, message, key, effect or rotation style) gets a `ref`; completion and the cart-name lint read it.
   - Extensions add entries per cart: `createCatalog(manifests)` (`ir/src/catalog.ts`) gives a `Catalog` of core plus extension blocks, which are named `<id>_…` and never shadow core names. Manifests are checked by `validateManifest` (`ir/src/extension.ts`).
   - Validation, `compile`, `toBlocks`/`fromBlocks`, the toolbox, the linter and `SourceDoc.setBlocks` all take a catalog (default `CORE_CATALOG`). The editor passes `session.catalog`. Anything a cart's code can call goes through the catalog, never through `BUILTINS` directly.
8. **All coordinate math goes through `runtime/src/core/space.ts`.** Stage settings (size, origin, y-axis, scaling) are cart data, and every other module asks `Space`. Positions are floats; pixel-art rounding happens only in `pixi/transform.ts`. Directions are visual (0 = screen-up, 90 = screen-right); `pose()` in `core/bounds.ts` applies the rotation style.
   - The pen (`core/pen.ts`) turns drawing into ops in stage pixels; the renderer drains them each frame into a texture between the map and the sprites. Sprite `x`/`y` are accessors so moves with the pen down draw.
   - Sensing that needs pixels (`core/collide.ts`) reads costume RGBA on the CPU (`CostumeInfo.pixels`, decoded lazily by `texturesFromCostumes`), never the GPU, so it's the same in Node, the stage and players.
9. **Concurrency:**
   - Scripts compile to generators and the scheduler steps each thread once per tick (fixed 60 Hz, `core/loop.ts`).
   - Every loop iteration ends in `yield`, except inside `warp` functions. Warp code still yields once a tick passes `WARP_BUDGET_MS`. `continue` jumps to the end of a labelled body block, so it still reaches that `yield`.
   - Clones (`World.createClone`) run their own instance of the sprite's module: `V` per clone, `P` (`shared var`) per sprite family, `G` global. The scheduler indexes scripts by event and drops a deleted clone's scripts and threads. `stage.cloneLimit` caps live clones; going past it throws.
   - Hats fired during a tick start on the next tick.
   - Time is simulation ticks, never the wall clock.
10. **The runtime stays small and separate.** `packages/runtime` depends only on `@stitch/cart` and `pixi.js`. It is most of what an exported player ships, so it lives within the player's 500 KB gzipped budget. lang, compiler, blocks and editor code reach it only through the compiled program and the `RuntimeApi` in `core/world.ts`. Audio follows the renderer pattern: `core/audio.ts` defines `AudioOut` (`NullAudio` in tests), and `web/audio.ts` implements it with Web Audio. Network does the same: `core/net.ts` defines `NetOut` (`NullNet` in tests) and `settle()` (a thread waits on a Promise across ticks), and `web/net.ts` forwards requests over the bridge.
   - `runner.ts` (`StageRunner`) runs a loaded cart in a page: renderer, audio, input, loop and a fresh world per Run. The sandboxed stage (`host.ts`) and exported players both use it, so they can't drift apart.
   - `web/fetch-net.ts` (`FetchNet`) does host permission, limits and fetching. The editor's `NetProxy` is `FetchNet` plus a secrets `prepare` step; players use it with none.
11. **The stage is a sandboxed iframe:**
   - `sandbox="allow-scripts"` (opaque origin) is the whole sandbox attribute.
   - The editor talks to it only through typed `postMessage` (`protocol.ts`).
   - Assets go in as transferred `ImageBitmap`s, and audio as transferred `Float32Array` samples. The stage never synthesizes or fetches.
   - The iframe also has `allow="autoplay"` (a permissions policy, not a sandbox flag), so the editor's Run click can start audio in it.
   - HTTP is proxied: the stage posts `http`, and the editor's `NetProxy` (`editor/src/lib/net.ts`) asks once per host per cart, adds secrets (`lib/secrets.ts`), fetches with limits, scrubs secrets from the reply and answers `http-result`. Details and the threat model are in `docs/network.md`.
   - Builds inline the stage's script into `stage.html` (one IIFE from `packages/export/build.ts`), so the opaque-origin stage loads nothing and hosting needs no CORS headers. It gets the CSP `default-src 'none'` with `connect-src 'none'`, so nothing in the stage, extension code included, can fetch. Both are build-only, because under `pnpm dev` the stage loads modules and HMR needs a websocket.
   - Extension scripts run only in the stage (`runtime/src/core/extensions.ts`, fresh each Run). The editor reads manifests and never evaluates extension code.
12. **Exports are the cart plus compiled code** (`packages/export`, [`docs/export.md`](docs/export.md)):
   - `ExportedGame` (`GAME_VERSION`) is the cart's sources without IR or editor state, plus `compile()` output. Players render assets and audio from sources with the same renderers as the editor.
   - Every format (HTML, PWA zip, Tauri project zip) is built around one page: game JSON and the player IIFE inlined, with the stage's CSP except `connect-src http: https:`. Text in a `<script>` goes through `jsonForScript` / `scriptText`.
   - Players fetch directly and never get secrets. Secrets, allowed hosts and editor state never reach an export.
   - PNG assets are inlined as data URLs on save and export (`inlineAssets` in `editor/src/lib/files.ts`).
13. **Registry-driven:** blocks, completions, signature help, hover docs, the generated sections of `docs/reference.md` and the Examples cart all come from one registry: the catalog (what can be called), `blocks/src/labels.ts` (block text) and the docs registry (`@stitch/blocks/registry`: prose, example and scope per builtin, sprite property and construct, with construct snippets). Derive editor and docs features from `describe()` / `SECTIONS`, so a new builtin or extension block reaches all of them with no other change.
   - The pure analysis (cursor context, scope, definitions) is `@stitch/lang/assist`; `editor/src/lib/assist.ts` builds items from it plus the registry, and `@stitch/lang/codemirror` wires them into CodeMirror.
   - Formatting is `format()` in `lang/src/format.ts`: parse, a trivia-only layout pass, then the canonical printer, so formatting can't change the program.

## Packages

`ir` (AST, catalog, validate, reconcile; `@stitch/ir/arbitrary` holds the shared fast-check generators) → `lang` (Lezer grammar, parse/print/format, editor analysis at `@stitch/lang/assist`, CodeMirror support at `@stitch/lang/codemirror`) → `compiler` (IR → JS) → `runtime` (scheduler, world, Pixi stage, host/bridge). `blocks` covers Blockly definitions, IR ↔ block JSON and the toolbox; `@stitch/blocks/workspace` is the Blockly glue, `/color` the contrast and colour-difference maths, `/docs` the docs-example helpers (`docs-render/` is the page `docs:blocks` drives), `/registry` the docs registry (rule 13). `cart` holds the cart format, stage settings, pixel, map, sfx and music helpers (pure), the audio renderer (`/audio`, pure), the asset renderer (`/render`, browser) and the PNG container (`/png`). `editor` is the Svelte app with four pages: `index.html`, `stage.html` (iframe host), `bench.html` and `docs.html` (the repo's markdown docs and block pictures, bundled at build time by `src/docs/pages.ts`, so the Docs button and hover links work offline). `export` holds the exported game format, the HTML/PWA/Tauri writers, the player entry (`src/player`) and `build.ts` (Vite's build API, Node only: one IIFE per entry). `desktop/` (not a pnpm package) is the editor's Tauri 2 shell.

Packages export TS source directly (`"exports": "./src/index.ts"`). The only real build is the player bundle; the editor imports it as a string from `virtual:stitch-player` (a plugin in `editor/vite.config.ts`).

## Commands

`pnpm dev` · `pnpm test` (Node) · `pnpm test:browser` (Vitest browser mode, real WebGL pixel tests) · `pnpm typecheck` · `pnpm lint` · `pnpm build` · `pnpm gen` · `pnpm check:licenses` · `pnpm check:size` · `pnpm docs:reference` · `pnpm docs:blocks` · `pnpm docs:api`

CI (`.github/workflows/ci.yml`) runs all of these except `docs:blocks` (which needs a browser and writes files), plus `prettier --check "**/*.ts"`.

- `pnpm docs:api` writes TypeDoc HTML for every package export to `docs/api/` (git-ignored); warnings fail it. `pnpm --filter @stitch/editor icons` regenerates the logo icons.

- After editing `stitch.grammar`, run `pnpm gen` and commit `parser.gen.js`. `gen.test.ts` fails when it is stale.
- `pnpm test:browser` also round-trips random programs through real Blockly (`blocks/src/blockly.browser.test.ts`). Run it after changing a block definition.
- Dev builds expose the Blockly workspace as `globalThis.__stitchBlocks` and the session as `globalThis.__stitchSession()` for scripted UI tests.
- The editor autosaves the cart to IndexedDB (`lib/storage.ts`, a small wrapper with no `idb` dependency) and restores it on load. `?cart=URL` opens a cart instead (the host must allow CORS).
- The same store holds `secrets` (per user), `autosave-hosts` (hosts the autosaved cart may reach) and `layout:<cart title>` (sash positions, view mode, orientation; `lib/layout.ts`). None is ever written to a cart. Panels resize through `lib/SplitPane.svelte`, which saves its state under its `id`.
- A sample extension is served at `/extensions/text/manifest.json` (`packages/editor/public/extensions/text`).
- Sample carts are listed in `editor/src/lib/samples.ts` (Cart tab → Samples, or `?sample=<id>`). Bounce is built from source; Examples is generated from the registry (`src/samples/examples/build.ts`); Patch Hop and Needle Storm are built from their `src/samples/<game>/*.stitch` code plus art, sounds and music in their `build.ts` (helpers in `src/samples/kit.ts`), and their tests play them with a bot; Stitch Dungeon is a cart made in the editor, shipped as `public/samples/stitch-dungeon.stitch.png`, with its code readable in `src/samples/dungeon/*.stitch`. After changing that code or the language, rebuild it with `node packages/editor/scripts/samples/dungeon.ts`, which drives the real editor to paint the art, make the sounds and music, type the code and save. `dungeon.test.ts` fails when the cart and the `.stitch` files differ.
- `pnpm check:size` builds the player to `packages/export/dist/player.js` and fails over 500 KB gzipped. Under `pnpm dev` the player builds on first export, then again after any change to `runtime`, `cart` or `export` sources.
- `cd desktop && cargo tauri dev` runs the desktop editor (needs Rust and the Tauri CLI; see `desktop/README.md`).
- Run the benchmark at `/bench.html?n=1000&renderer=webgl|webgpu&sandbox=1`. The pass bar is avg ≥ 59 fps and p95 ≤ 18 ms. Headless Playwright must use `channel: 'chromium'`; the default headless shell stalls on WebGL readback and reports bogus fps.

## Conventions

- TypeScript strict with `noUncheckedIndexedAccess`; `unknown` plus narrowing where a type is open. Discriminated unions on `kind`.
- Pure core, thin adapters: logic lives in DOM-free modules tested in Node; Pixi/DOM code applies results (e.g. `displayTransform` → `PixiRenderer`).
- Tests sit next to source as `*.test.ts`; GPU/DOM tests are `*.browser.test.ts`. Behaviour of compiled code is tested by compiling real Stitch source and running it on `World` with `NullRenderer`.
- Prettier covers `.ts` only (no Svelte plugin is installed); match the existing style in `.svelte` files.
- Match surrounding style: short doc comments on exported items, comments that explain *why*.
- Every behaviour that differs from Scratch is listed with its reason in `docs/departures.md`. Update it in the same change.
- **Styling:** colours, fonts, spacing and radii come from the design tokens (CSS variables in `packages/editor/src/app.css`, the single token file; light on `:root`, dark on `[data-theme='dark']`).
  - Use `var(--…)` in components, never colour literals: `tokens.test.ts` fails on hex/`rgb()`/`hsl()`/`white`/`black` in `.svelte` styles, inline styles and canvas `fillStyle`/`strokeStyle`. Canvas code reads tokens with `token()` (`lib/theme.ts`) and reads `themeVersion()` (`lib/theme-version.svelte.ts`) in its draw effect so it redraws when the theme changes.
  - A new colour is a token with a light and a dark value, plus its pairings in `tokens.test.ts`, which checks WCAG AA in both themes.
  - Icons are lucide: `@lucide/svelte` in the editor, `lucide` (vanilla, two icons) in the player. Use them instead of emoji or symbol characters, with an `aria-label` on icon-only buttons.
  - Code-like text (editors, console, ids) uses `--font-mono` (JetBrains Mono); everything else uses `--font-ui` (Inter). Both are self-hosted from `@fontsource`.
  - Blockly can't read CSS variables: category colours are `BLOCK_COLOURS` (`blocks/src/definitions.ts`, checked by `palette.test.ts` for white-text contrast and colour-blind distinctness), and workspace surfaces are passed in from tokens.
  - Ask with `ask`/`askText`/`tell` (`lib/dialog.svelte.ts`), never native `confirm`/`prompt`/`alert`.
  - The theme preference is per user (`localStorage` `stitch.theme`), never cart data. The exported player keeps its own token copy (`PLAYER_TOKENS` in `export/src/player/shell.ts`).
  - The logo lives in `editor/src/lib/logo.ts`. After changing it, run `pnpm --filter @stitch/editor icons` to regenerate the favicon, PWA, Apple and desktop icons (`icons.test.ts` catches stale ones).
- **Docs:** a new builtin, keyword, block type, music effect or cart field gets documented in the same change. The docs check (`packages/blocks/src/docs.test.ts`, part of `pnpm test`) fails without it.
  - Every `###` entry in `docs/reference.md` lives in the docs registry (`blocks/src/reference/*.ts`) and is written into `<!-- generated: id -->` regions by `pnpm docs:reference`; edit the registry, never those regions. Section intros outside the regions stay hand-written. Cart fields go in `docs/cart-format.md`.
  - An example is a `stitch` fence right after `<!-- example: name -->`. Its block picture is `docs/blocks/<name>.svg`, rendered from the same text by `pnpm docs:blocks` (`toBlocks` plus real Blockly in headless Chromium, `packages/blocks/scripts/docs-blocks.ts`). Each SVG carries a hash of its example, so the check catches stale pictures in Node. Snippets that aren't top-level items are parsed inside `on start do … end`, and may use undeclared variables but nothing else invalid.
  - A `json` fence after `<!-- manifest -->` declares an extension manifest that examples may use.
  - The check also covers every keyword in the grammar, every block type, every effect in `EFFECTS`, every field of a fully filled cart (`Required<Cart>`, so a new field is a type error until it's added there), and every relative link and anchor in README, CONTRIBUTING and `docs/`.
  - `docs/departures.md`, `docs/plan.md` and this file stay the sources of truth; user docs link to them rather than copy them. The tutorials (`docs/tutorials/`) are verified by following them in the editor; update them when the UI they describe changes.

## Dependencies

Shipped dependencies are MIT, Apache-2.0, BSD, ISC or 0BSD only, enforced by `scripts/check-licenses.mjs`. The one exception is the two `@fontsource` font packages, which are SIL OFL-1.1 (font files only, approved by the owner). Ask the owner before adding any other license (always for GPL/AGPL). Dev-only exceptions are listed in that script with their reason. `autoInstallPeers: false` (pnpm-workspace.yaml) keeps Blockly's Node-only jsdom peer out, so the "missing peer jsdom" warning is expected.

# Stitch

Browser creative-coding environment: a faster Scratch/TurboWarp with PICO-8-style carts. One typed IR is the source of truth; text and blocks are two editors of it; a compiler turns IR into JS that runs as green threads in a sandboxed stage.

## Architecture rules

1. **IR is the source of truth** (`packages/ir`). Every other representation is derived from it. Shape changes bump `IR_VERSION` and add a step to `migrateProject`. The same rule applies to `CART_VERSION` (`packages/cart`) and `PROTOCOL_VERSION` (`packages/runtime/src/protocol.ts`).
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
6. **The builtin catalog is the single registry** (`packages/ir/src/builtins.ts`). To add a builtin: catalog entry, then runtime impl in `runtime/src/core/builtins.ts` (a test enforces 1:1 and the `yields` flag), then a label in `blocks/src/labels.ts` (a test checks the `%n` slots). The grammar and IR stay unchanged.
7. **All coordinate math goes through `runtime/src/core/space.ts`.** Stage settings (size, origin, y-axis, scaling) are cart data, and every other module asks `Space`. Positions are floats; pixel-art rounding happens only in `pixi/transform.ts`. Directions are visual (0 = screen-up, 90 = screen-right).
8. **Concurrency:**
   - Scripts compile to generators and the scheduler steps each thread once per tick (fixed 60 Hz, `core/loop.ts`).
   - Every loop iteration ends in `yield`, except inside `warp` functions. Warp code still yields once a tick passes `WARP_BUDGET_MS`.
   - Hats fired during a tick start on the next tick.
   - Time is simulation ticks, never the wall clock.
9. **The runtime stays small and separate.** `packages/runtime` depends only on `@stitch/cart` and `pixi.js`. lang, compiler, blocks and editor code reach it only through the compiled program and the `RuntimeApi` in `core/world.ts`.
10. **The stage is a sandboxed iframe:**
   - `sandbox="allow-scripts"` (opaque origin) is the whole sandbox attribute.
   - The editor talks to it only through typed `postMessage` (`protocol.ts`).
   - Assets go in as transferred `ImageBitmap`s.
   - Anything sensitive (Phase 5 secrets, HTTP) stays editor-side and is proxied over the bridge.

## Packages

`ir` (AST, catalog, validate, reconcile; `@stitch/ir/arbitrary` holds the shared fast-check generators) → `lang` (Lezer grammar, parse/print, CodeMirror support at `@stitch/lang/codemirror`) → `compiler` (IR → JS) → `runtime` (scheduler, world, Pixi stage, host/bridge). `blocks` covers Blockly definitions, IR ↔ block JSON and the toolbox; `@stitch/blocks/workspace` is the Blockly glue. `cart` holds the cart format and stage settings. `editor` is the Svelte app with three pages: `index.html`, `stage.html` (iframe host) and `bench.html`. `export` arrives in Phase 6.

Packages export TS source directly (`"exports": "./src/index.ts"`). There is no per-package build yet.

## Commands

`pnpm dev` · `pnpm test` (Node) · `pnpm test:browser` (Vitest browser mode, real WebGL pixel tests) · `pnpm typecheck` · `pnpm lint` · `pnpm build` · `pnpm gen` · `pnpm check:licenses`

- After editing `stitch.grammar`, run `pnpm gen` and commit `parser.gen.js`. `gen.test.ts` fails when it is stale.
- `pnpm test:browser` also round-trips random programs through real Blockly (`blocks/src/blockly.browser.test.ts`). Run it after changing a block definition.
- Dev builds expose the Blockly workspace as `globalThis.__stitchBlocks` for scripted UI tests.
- Run the benchmark at `/bench.html?n=1000&renderer=webgl|webgpu&sandbox=1`. The pass bar is avg ≥ 59 fps and p95 ≤ 18 ms. Headless Playwright must use `channel: 'chromium'`; the default headless shell stalls on WebGL readback and reports bogus fps.

## Conventions

- TypeScript strict with `noUncheckedIndexedAccess`; `unknown` plus narrowing where a type is open. Discriminated unions on `kind`.
- Pure core, thin adapters: logic lives in DOM-free modules tested in Node; Pixi/DOM code applies results (e.g. `displayTransform` → `PixiRenderer`).
- Tests sit next to source as `*.test.ts`; GPU/DOM tests are `*.browser.test.ts`. Behaviour of compiled code is tested by compiling real Stitch source and running it on `World` with `NullRenderer`.
- Prettier covers `.ts` only (no Svelte plugin is installed); match the existing style in `.svelte` files.
- Match surrounding style: short doc comments on exported items, comments that explain *why*.
- Every behaviour that differs from Scratch is listed with its reason in `docs/departures.md`. Update it in the same change.

## Dependencies

Shipped dependencies are MIT, Apache-2.0, BSD, ISC or 0BSD only, enforced by `scripts/check-licenses.mjs`. Ask the owner before adding any other license (always for GPL/AGPL). Dev-only exceptions are listed in that script with their reason. `autoInstallPeers: false` (pnpm-workspace.yaml) keeps Blockly's Node-only jsdom peer out, so the "missing peer jsdom" warning is expected.

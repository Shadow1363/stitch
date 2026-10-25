# Contributing to Stitch

Thanks for helping. This page covers setup, tests and the workflow. The rules the code follows (architecture, conventions, dependencies) live in one place, [`CLAUDE.md`](CLAUDE.md), so this page links to it instead of repeating it. Read it before a non-trivial change. [docs/architecture.md](docs/architecture.md) is the gentler introduction.

## Setup

You need Node 22 or newer (CI uses 24) and pnpm 10 (`corepack enable` gives you the pinned version).

```sh
pnpm install
pnpm dev            # the editor at http://localhost:5173
```

Browser tests and the docs tools use Playwright's Chromium: `pnpm exec playwright install chromium` once.

## Checks

CI (`.github/workflows/ci.yml`) runs all of these, and a change should pass them locally first:

| Command | Checks |
|---|---|
| `pnpm typecheck` | TypeScript (strict) and `svelte-check` |
| `pnpm lint` | ESLint |
| `pnpm exec prettier --check "**/*.ts"` | Formatting (`.ts` only; match the surrounding style in `.svelte`) |
| `pnpm test` | Node tests, including the docs check and the design-token contrast check |
| `pnpm test:browser` | Real WebGL pixel tests and Blockly round-trips in headless Chromium |
| `pnpm check:licenses` | Shipped dependencies use an allowed license |
| `pnpm check:size` | The exported player stays under 500 KB gzipped |
| `pnpm build` | The production editor builds |
| `pnpm docs:api` | API docs build from TSDoc with no warnings |

## What a change needs

- **Tests next to the code** (`*.test.ts`, or `*.browser.test.ts` for GPU/DOM). Behaviour of compiled code is tested by compiling real Stitch source and running it on `World` with `NullRenderer`.
- **Docs in the same change.** A new builtin, keyword, block type, music effect or cart field needs a [reference](docs/reference.md) or [cart-format](docs/cart-format.md) entry. Examples are written as:

  ````md
  <!-- example: my_builtin -->
  ```stitch
  my_builtin(1)
  ```
  ````

  Then run `pnpm docs:blocks` to render its block picture into `docs/blocks/`. The docs check (`packages/blocks/src/docs.test.ts`) fails until the entry, a parsing example and a current picture exist, and also checks every relative link and anchor in the docs.
- **Scratch differences** go in [docs/departures.md](docs/departures.md) with the reason.
- **Format changes** bump the right version and add a migration ([CLAUDE.md](CLAUDE.md), rule 1).
- **Colours** are design tokens ([CLAUDE.md](CLAUDE.md), Styling); `tokens.test.ts` rejects literals in components and checks contrast.
- **Dependencies** must be MIT, Apache-2.0, BSD, ISC or 0BSD. Ask before anything else.

## Regenerating files

| After changing | Run |
|---|---|
| `packages/lang/src/stitch.grammar` | `pnpm gen` (commit `parser.gen.js`) |
| A docs example | `pnpm docs:blocks` |
| A ```` ```mermaid ```` diagram in the docs | `pnpm docs:diagrams` |
| The logo (`packages/editor/src/lib/logo.ts`) | `pnpm --filter @stitch/editor icons` |

Each has a test that fails when the generated files are stale.

## Commits and pull requests

Keep a pull request to one change, with a description of what changed and why, and how it was tested. Phase-sized work follows [docs/plan.md](docs/plan.md); update it when something on it lands or changes.

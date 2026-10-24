# Exporting and sharing games

A finished game can leave the editor in four ways. **Cart → Save** writes a `.stitch.png` cart: the whole project, for you or other Stitch users to keep editing. **Cart → Export** makes a game for players, with no editor:

| Format | File | Runs | Network |
|---|---|---|---|
| HTML file | `<title>.html` | Anywhere, including opened from disk. Upload it to itch.io or any static host | Browser `fetch`; the API must allow CORS |
| Web app | `<title>-pwa.zip` | Unzip to an HTTPS host (or localhost). Players can install it and play offline after the first visit | Browser `fetch`; the API must allow CORS |
| Desktop project | `<title>-desktop.zip` | Build it with Rust and the Tauri CLI (see its README) into an app for Windows, macOS or Linux | Tauri's HTTP plugin; no CORS, URL allow-list |

Each export compiles the cart first, so a cart with errors in **Problems** doesn't export; the message names the first one. The title comes from **Cart → Title**.

## Sharing an HTML file

The HTML file is the simplest export: one file, about 600 KB for a small game, with everything inside.

- **itch.io:** rename the file to `index.html` and zip it (itch.io takes HTML games as a zip with `index.html` at the top). Create a project, set *Kind of project* to **HTML**, upload the zip and tick *This file will be played in the browser*. Size the embed to your stage plus a little margin, or tick *Fullscreen button*.
- **GitHub Pages, Netlify, Cloudflare Pages or any web server:** upload it as `index.html`, or under any name.
- **Email or a USB stick:** it also runs when opened straight from disk.

The page fills the window and scales the stage to fit, letterboxed with the cart's stage settings. Players click **Play** first, which is what lets the browser start sound.

## Installable web app

Unzip `<title>-pwa.zip` and upload the folder to an HTTPS host. On first visit the browser caches the game; after that it starts offline, and browsers offer to install it as an app with the game's icon (drawn from its starting frame).

- Service workers need HTTPS or `localhost`. Opened from disk, the page still runs, but doesn't install or work offline.
- Upload a new export over the old one to update it: players get the new version on their next visit.
- Several games can share one site if each has its own folder.

## Desktop app

The desktop zip is a [Tauri 2](https://v2.tauri.app) project. To build it you need Rust (`https://rustup.rs`), Tauri's [prerequisites](https://v2.tauri.app/start/prerequisites/) for your system, and the CLI (`cargo install tauri-cli --version "^2" --locked`). Then:

```sh
cd my-game-desktop
cargo tauri build      # installers land in src-tauri/target/release/bundle/
```

`cargo tauri dev` opens it without building an installer. The project's README covers icons and signing. The desktop template has not yet been compiled in CI (see [plan.md](plan.md#known-gaps)).

## Games that use the network

Games that call `http_get` or `http_post`, or extensions that use `stitch.http`, behave differently once exported. In the editor, requests go through the editor, which asks once per host and adds your secrets. In an export:

- **Players are asked** before the game contacts each host (*"This game wants to connect to …"*), once per page load.
- **No secrets.** Secrets live in your browser and never leave the editor, so an API that needs a key won't get one from an exported game. Don't paste a key into your code to get round this: anyone can read an exported game's code. Put the key on a small server of your own that calls the API for the game, and have the game call that server instead.
- **CORS still applies** to the HTML and web-app exports, exactly as in the editor: the API must send `Access-Control-Allow-Origin`. See [CORS in the browser](network.md#cors-in-the-browser). The desktop export makes requests natively, so CORS doesn't apply there.
- **Desktop allow-list.** The desktop project only lets the game reach the origins written as URL text in its code (`"https://api.example.com/…"`). A URL the game builds at run time must be added by hand to `src-tauri/capabilities/default.json`.
- The same limits as the editor apply: 10 s per request, 1 MB per reply, 8 requests at once, no cookies.

## What's inside

Every format is built around the same single page:

- `<script type="application/json" id="stitch-game">` holds the **game**: the cart's sources without the IR or editor state, plus the compiled program (`ExportedGame` in `packages/export/src/game.ts`, versioned by `GAME_VERSION`).
  - Assets stay sources (pixel layers, SVG, PNG data URLs), and sounds and songs stay parameters. The player renders them at start-up with `@stitch/cart/render` and `@stitch/cart/audio`, exactly as the editor renders them for its stage.
  - PNG assets given as URLs are fetched and inlined at export (and when saving a `.stitch.png`), so nothing depends on where the editor was hosted.
  - Extensions are included as manifest plus script, and run as they do in the stage.
- `<script>` holds the **player**: `@stitch/runtime`'s `StageRunner` (the same one the editor's stage uses), the asset and audio renderers, and a small shell. It's one classic script built from `packages/export/src/player/main.ts`, with a budget of 500 KB gzipped (172 KB today), which CI enforces through `pnpm check:size`.
- A Content-Security-Policy meta tag: `default-src 'none'` with inline scripts and `eval` (the compiled program runs through `new Function`, as in the stage), and `connect-src http: https:`, since there's no editor to proxy requests.

Never in an export: secrets, allowed hosts, the autosave, block layout or loose blocks.

## The player

- A start screen shows the title and author. Its **Play** click is the user gesture that lets audio start.
- The stage fills the window, scaled and letterboxed by the cart's stage settings. A faint ↻ button in the corner restarts from the initial state.
- `print` goes to the browser console as `[sprite] text`. Runtime errors go to the console and to a bar at the bottom of the page.
- The player's colours are a copy of the editor's dark design tokens (`PLAYER_TOKENS`), and it uses system fonts, so it loads nothing.

## Web app files

The zip holds `index.html`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png` and `sw.js`. Icons are the stage's starting frame, fitted on the stage background.

- Service workers need HTTPS or localhost. Opened from disk, the page still runs, but doesn't install or cache.
- The worker caches the game's files on install and serves them cache-first. Requests to other origins (APIs) are never cached.
- The cache is named after the game and a hash of its content, so uploading a new export replaces the old cache on the next visit. Several games can share an origin if each has its own folder.

## Desktop project files

The zip is a Tauri 2 project: `www/index.html` (the page, with a CSP that also allows Tauri's IPC) and `src-tauri/` (Cargo project, config, capability file, icons).

- `withGlobalTauri` exposes the HTTP plugin as `window.__TAURI__.http`, and the player uses its `fetch` when present. Requests are made natively, so CORS doesn't apply.
- `src-tauri/capabilities/default.json` allows only the origins named by URL string literals in the program and extension code. URLs built at run time must be added there by hand.
- `cargo tauri icon src-tauri/icons/icon.png` makes every icon size from the 512 px icon.

The editor itself also has a Tauri shell in [`desktop/`](../desktop/README.md); its proxy uses the same HTTP plugin.

## Hosting the editor

`pnpm build` writes a static site to `packages/editor/dist`. Any static host works, and no special headers are needed:

- `stage.html` runs in a sandboxed iframe with an opaque origin, so any script it loaded would be a cross-origin request. Builds avoid that by **inlining** the stage's script (one classic script, built like the player), so the stage loads nothing and needs no `Access-Control-Allow-Origin`.
- The stage's CSP (`default-src 'none'`, `connect-src 'none'`) is a meta tag in `stage.html`, so it holds on any host.
- `?cart=URL` needs the cart's host to allow CORS for the editor's origin.

Under `pnpm dev`, the stage still loads modules from the dev server, which is why the dev server allows the `null` origin (open decision 5 in [`plan.md`](plan.md)).

## How the bundles are built

`packages/export/build.ts` wraps Vite's build API to produce one IIFE with no imports or chunks (`buildIife`). Three things use it:

- `pnpm check:size` writes `packages/export/dist/player.js` and fails over budget.
- The editor's `virtual:stitch-player` module is the player as a string. Exports inline it, and it's built on first use under `pnpm dev`, then rebuilt after changes to `runtime`, `cart` or `export` sources.
- The editor build inlines `src/stage-entry.ts` into `stage.html`.

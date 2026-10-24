/**
 * A Tauri 2 desktop project for one game: the single-file page as its frontend, plus the
 * HTTP plugin, so the game's requests are made natively (no CORS) within a URL allow-list.
 * Building it needs Rust and the Tauri CLI; the README in the project says how.
 */
import { slug, type ExportedGame } from './game';
import { exportHtml } from './html';
import { pngToIco } from './ico';
import type { FileSet } from './pwa';

export interface TauriIcons {
  /** PNG bytes, square. */
  256: Uint8Array;
  512: Uint8Array;
}

export function tauriFiles(game: ExportedGame, playerJs: string, icons: TauriIcons): FileSet {
  const name = crateName(game.title);
  const origins = originsIn(game);
  const k = Math.max(1, Math.floor(960 / Math.max(game.stage.width, game.stage.height)));
  const conf = {
    $schema: 'https://schema.tauri.app/config/2',
    productName: productName(game.title),
    version: '0.1.0',
    identifier: `games.stitch.${name}`,
    build: { frontendDist: '../www' },
    app: {
      // The player finds the HTTP plugin as window.__TAURI__.http.
      withGlobalTauri: true,
      windows: [
        {
          label: 'main',
          title: game.title,
          width: game.stage.width * k,
          height: game.stage.height * k,
          resizable: true,
        },
      ],
      // The page sets its own CSP (a meta tag), the same one as the HTML export plus Tauri's IPC.
      security: { csp: null },
    },
    bundle: {
      active: true,
      targets: 'all',
      icon: ['icons/icon.png', 'icons/icon.ico'],
    },
  };
  const capability = {
    $schema: '../gen/schemas/desktop-schema.json',
    identifier: 'default',
    description: 'What the game window may do. Add URLs here that the game builds at run time.',
    windows: ['main'],
    permissions: [
      'core:default',
      {
        identifier: 'http:default',
        allow: origins.map((o) => ({ url: `${o}/*` })),
      },
    ],
  };
  return {
    'README.md': readme(game, origins),
    '.gitignore': 'src-tauri/target/\nsrc-tauri/gen/\n',
    'www/index.html': exportHtml(game, playerJs, { target: 'tauri' }),
    'src-tauri/Cargo.toml': cargoToml(name),
    'src-tauri/build.rs': 'fn main() {\n    tauri_build::build()\n}\n',
    'src-tauri/src/main.rs': MAIN_RS,
    'src-tauri/tauri.conf.json': JSON.stringify(conf, null, 2) + '\n',
    'src-tauri/capabilities/default.json': JSON.stringify(capability, null, 2) + '\n',
    'src-tauri/icons/icon.png': icons[512],
    'src-tauri/icons/icon.ico': pngToIco(icons[256], 256),
  };
}

/**
 * Origins (`https://host[:port]`) named by URL string literals in the program or extension
 * code. They seed the capability's allow-list; URLs built at run time must be added by hand.
 */
export function originsIn(game: ExportedGame): string[] {
  const out = new Set<string>();
  for (const text of [game.code, ...game.extensions.map((e) => e.code)])
    for (const m of text.matchAll(/\b(https?):\/\/([a-z0-9.-]+(?::\d+)?)/gi))
      out.add(`${m[1]!.toLowerCase()}://${m[2]!.toLowerCase()}`);
  return [...out].sort();
}

/** Cargo package names: lowercase letters, digits, `-` and `_`, not starting with a digit. */
export function crateName(title: string): string {
  const s = slug(title);
  return /^[a-z]/.test(s) ? s : `stitch-${s}`;
}

/** Letters, digits, spaces and a little punctuation: the name becomes file and bundle names. */
function productName(title: string): string {
  return title.replace(/[^\p{L}\p{N} ._-]/gu, '').trim() || 'Stitch game';
}

function cargoToml(name: string): string {
  return `[package]
name = "${name}"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-http = "2"
`;
}

const MAIN_RS = `// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running the game");
}
`;

function readme(game: ExportedGame, origins: string[]): string {
  const allowed = origins.length
    ? origins.map((o) => `- \`${o}/*\``).join('\n')
    : '- (none: the game names no URLs, so every request is refused)';
  return `# ${game.title}

A desktop build of a Stitch game, made with Tauri 2.

## Build

1. Install Rust (https://rustup.rs) and the Tauri prerequisites for your system:
   https://v2.tauri.app/start/prerequisites/
2. Install the Tauri CLI: \`cargo install tauri-cli --version "^2" --locked\`
3. In this folder: \`cargo tauri dev\` to try it, \`cargo tauri build\` for an installer
   (written to \`src-tauri/target/release/bundle/\`).

Run \`cargo tauri icon src-tauri/icons/icon.png\` to make every icon size from the 512 px icon.

## Network

The game's HTTP requests go through Tauri's HTTP plugin, so they are made natively and CORS
doesn't apply. The game still asks before it first contacts each host. Only these URLs are
allowed (\`src-tauri/capabilities/default.json\`), found as string literals in the game:

${allowed}

Add any URL the game builds at run time there. Secrets from the Stitch editor are never part
of an export; a game that needs an API key needs a server of your own that holds it.
`;
}

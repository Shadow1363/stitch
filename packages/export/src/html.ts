/**
 * The single-file player: one HTML page holding the player script, the compiled program and
 * every asset source, so it runs from disk with no server and no CORS.
 */
import type { ExportedGame } from './game';

/** Where the page will run; each needs a slightly different CSP. */
export type HtmlTarget = 'html' | 'pwa' | 'tauri';

/**
 * Same rules as the editor's stage, except that players fetch directly (there's no editor to
 * proxy for them). `unsafe-eval` runs the compiled program and extension scripts, like the
 * stage's `new Function`; `data:` in connect-src lets PNG assets decode.
 */
export function playerCsp(target: HtmlTarget): string {
  const connect = ['data:', 'http:', 'https:'];
  const worker = ['blob:'];
  const extra: string[] = [];
  if (target === 'pwa') {
    worker.unshift("'self'");
    extra.push("manifest-src 'self'");
  }
  // Tauri's IPC (used by its HTTP plugin) is a custom protocol on macOS and Linux and
  // http://ipc.localhost on Windows.
  if (target === 'tauri') connect.push('ipc:', 'http://ipc.localhost');
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval'",
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'media-src data: blob:',
    `connect-src ${connect.join(' ')}`,
    `worker-src ${worker.join(' ')}`,
    ...extra,
    "form-action 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
  ].join('; ');
}

export interface HtmlOptions {
  target?: HtmlTarget;
  /** Extra markup for the end of `<head>` (manifest link, icons). */
  head?: string;
  /** Extra inline script run after the player (service worker registration). */
  script?: string;
}

/** The page for `game`, with `playerJs` (the built player bundle) inlined. */
export function exportHtml(game: ExportedGame, playerJs: string, opts: HtmlOptions = {}): string {
  const target = opts.target ?? 'html';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${playerCsp(target)}" />
    <meta name="generator" content="Stitch" />
    <title>${escapeHtml(game.title)}</title>${opts.head ? `\n    ${opts.head}` : ''}
  </head>
  <body>
    <div id="stage"></div>
    <script type="application/json" id="stitch-game">${jsonForScript(game)}</script>
    <script>${scriptText(playerJs)}</script>${opts.script ? `\n    <script>${scriptText(opts.script)}</script>` : ''}
  </body>
</html>
`;
}

export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/** JSON that can't end its `<script>` early: `<` only occurs inside strings, so escape it there. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Script text safe inside `<script>`: `</script` and `<!--` can only occur in strings, regexes
 * and comments, where `<\/` and `<\x21` (in regexes too, even with the `u` flag) mean the same.
 */
export function scriptText(js: string): string {
  return js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\x21--');
}

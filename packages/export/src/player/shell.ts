/**
 * The player's own UI around the stage: a start screen (its click unlocks audio, as the
 * editor's Run click does), the host prompt, an error bar and a restart button. Plain DOM,
 * styled here so the page needs nothing else.
 */
import { LETTERBOX } from '@stitch/runtime';
import { createElement, RotateCcw, X, type IconNode } from 'lucide';

/**
 * The player's copy of the editor's design tokens (it can't load app.css): the dark theme's
 * values, since the player always sits on the dark letterbox. `export.test.ts` checks their
 * contrast. Fonts stay system fonts, so an export loads nothing.
 */
export const PLAYER_TOKENS = {
  bg: LETTERBOX,
  text: '#e7eaf0',
  muted: '#9ba4b5',
  card: '#191d25',
  line: '#2b313d',
  overlay: '#0d1017b8',
  accent: '#7aa2ff',
  onAccent: '#0b1020',
  quiet: '#2b313d',
  focus: '#8fb0ff',
  bad: '#8e2b2b',
  onBad: '#ffffff',
};

const vars = Object.entries(PLAYER_TOKENS)
  .map(([k, v]) => `--st-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${v};`)
  .join(' ');

const CSS = `
:root { ${vars} }
html, body { margin: 0; height: 100%; overflow: hidden; background: var(--st-bg); color: var(--st-text);
  font: 15px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
#stage { position: fixed; inset: 0; outline: none; }
.st-layer { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: var(--st-overlay); z-index: 2; }
.st-card { background: var(--st-card); border: 1px solid var(--st-line); border-radius: 12px; padding: 20px 24px;
  max-width: min(420px, calc(100vw - 32px)); box-sizing: border-box; text-align: center; }
.st-card h1 { margin: 0 0 4px; font-size: 22px; }
.st-card p { margin: 0 0 14px; color: var(--st-muted); overflow-wrap: anywhere; }
.st-card code { font-family: ui-monospace, Menlo, monospace; color: var(--st-text); }
.st-row { display: flex; gap: 8px; justify-content: center; }
.st-btn { font: inherit; font-weight: 600; border: 0; border-radius: 8px; padding: 9px 18px; cursor: pointer;
  background: var(--st-accent); color: var(--st-on-accent); }
.st-btn.st-quiet { background: var(--st-quiet); color: var(--st-text); }
.st-btn:focus-visible { outline: 2px solid var(--st-focus); outline-offset: 2px; }
.st-restart { position: fixed; top: 10px; right: 10px; z-index: 1; opacity: 0.25; padding: 6px 10px; }
.st-restart:hover, .st-restart:focus-visible { opacity: 1; }
.st-error { position: fixed; left: 0; right: 0; bottom: 0; z-index: 3; background: var(--st-bad); color: var(--st-on-bad);
  padding: 8px 40px 8px 12px; font: 13px/1.4 ui-monospace, Menlo, monospace; white-space: pre-wrap; }
.st-error button { position: absolute; top: 4px; right: 6px; background: none; border: 0; color: var(--st-on-bad);
  font-size: 18px; cursor: pointer; }
`;

export function installStyles(): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** A lucide icon as inline SVG (no request: players load nothing), labelled by its button. */
const icon = (i: IconNode) => createElement(i, { width: 16, height: 16, 'aria-hidden': 'true' });

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

function layer(...children: Node[]): HTMLDivElement {
  const l = el('div', { className: 'st-layer' }, el('div', { className: 'st-card' }, ...children));
  document.body.appendChild(l);
  return l;
}

/** The start screen; resolves when the player clicks Play. */
export function startScreen(title: string, author: string | undefined): Promise<void> {
  return new Promise((resolve) => {
    const play = el('button', { className: 'st-btn', textContent: 'Play' });
    const l = layer(
      el('h1', { textContent: title }),
      el('p', { textContent: author ? `by ${author}` : 'Made with Stitch' }),
      el('div', { className: 'st-row' }, play),
    );
    play.onclick = () => {
      l.remove();
      resolve();
    };
    play.focus();
  });
}

/** A message with no buttons (loading, or a game this player can't run). */
export function message(text: string): { remove(): void } {
  return layer(el('p', { textContent: text }));
}

/** Asks whether the game may contact `host`. Questions queue, one card at a time. */
let asking: Promise<unknown> = Promise.resolve();
export function askHost(host: string): Promise<boolean> {
  const answer = asking.then(
    () =>
      new Promise<boolean>((resolve) => {
        const allow = el('button', { className: 'st-btn', textContent: 'Allow' });
        const block = el('button', { className: 'st-btn st-quiet', textContent: 'Block' });
        const l = layer(
          el('p', {}, 'This game wants to connect to ', el('code', { textContent: host }), '.'),
          el('div', { className: 'st-row' }, block, allow),
        );
        const done = (ok: boolean) => {
          l.remove();
          resolve(ok);
        };
        allow.onclick = () => done(true);
        block.onclick = () => done(false);
        block.focus();
      }),
  );
  asking = answer;
  return answer;
}

/** Shows the latest error at the bottom of the page; the author's console has the rest. */
let bar: HTMLDivElement | undefined;
export function showError(text: string): void {
  bar?.remove();
  const close = el('button', { title: 'Dismiss', ariaLabel: 'Dismiss' }, icon(X));
  bar = el('div', { className: 'st-error', role: 'alert' }, text, close);
  close.onclick = () => bar?.remove();
  document.body.appendChild(bar);
}

export function restartButton(onclick: () => void): void {
  document.body.appendChild(
    el(
      'button',
      {
        className: 'st-btn st-quiet st-restart',
        title: 'Restart',
        ariaLabel: 'Restart',
        onclick,
      },
      icon(RotateCcw),
    ),
  );
}

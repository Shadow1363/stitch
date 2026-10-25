/**
 * The docs that ship inside the editor (docs.html): every markdown file under docs/ plus the
 * README and CONTRIBUTING, and the pictures they show, bundled at build time so the docs work
 * offline and in the desktop app and match the editor they came with.
 */
import { diagramFile } from '@stitch/blocks/diagrams';
import { Marked, type Tokens } from 'marked';

// Repo-relative paths from this file's folder (packages/editor/src/docs).
const ROOT = '../../../../';

const RAW = import.meta.glob(
  [
    '../../../../docs/**/*.md',
    '!../../../../docs/api/**',
    '../../../../README.md',
    '../../../../CONTRIBUTING.md',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const FILES = import.meta.glob(
  ['../../../../docs/**/*.{svg,png,jpg,gif,webp}', '!../../../../docs/api/**'],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;

const strip = (k: string) => k.slice(ROOT.length);

/** Markdown by repo-relative path, e.g. `docs/reference.md`. */
export const PAGES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(RAW).map(([k, v]) => [strip(k), v]),
);

/** Built URLs of the docs' pictures, by repo-relative path. */
export const ASSETS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(FILES).map(([k, v]) => [strip(k), v]),
);

export const HOME = 'docs/reference.md';

/** The sidebar: groups of pages, in reading order. Pages not listed here go under More. */
export const NAV: readonly { group: string; pages: string[] }[] = [
  {
    group: 'Start',
    pages: [
      'README.md',
      'docs/tutorials/first-game-scratch.md',
      'docs/tutorials/first-game-pico8.md',
    ],
  },
  {
    group: 'Reference',
    pages: [
      'docs/reference.md',
      'docs/extensions.md',
      'docs/import-scratch.md',
      'docs/export.md',
      'docs/network.md',
      'docs/cart-format.md',
    ],
  },
  {
    group: 'Project',
    pages: ['docs/departures.md', 'docs/architecture.md', 'docs/plan.md', 'CONTRIBUTING.md'],
  },
];

/** The sidebar with every bundled page: NAV's groups (missing pages dropped), then the rest. */
export function navigation(): { group: string; pages: string[] }[] {
  const listed = new Set(NAV.flatMap((g) => g.pages));
  const more = Object.keys(PAGES)
    .filter((p) => !listed.has(p))
    .sort();
  return [
    ...NAV.map((g) => ({ group: g.group, pages: g.pages.filter((p) => p in PAGES) })),
    ...(more.length ? [{ group: 'More', pages: more }] : []),
  ].filter((g) => g.pages.length);
}

/** Titles for pages whose first heading isn't one (the README opens with the logo). */
const TITLES: Record<string, string> = { 'README.md': 'Overview' };

/** A page's title: its first `#` heading, else its file name. */
export function titleOf(path: string): string {
  if (TITLES[path]) return TITLES[path];
  const m = /^#\s+(.+)$/m.exec(PAGES[path] ?? '');
  return m ? m[1]!.replace(/`/g, '') : path.split('/').pop()!;
}

/** GitHub's heading anchors, as the docs check uses them. */
export const slug = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');

/** `a/b/../c` → `a/c`, for joining a link onto its page's folder. */
function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
}

export const pageUrl = (path: string, anchor?: string) =>
  `docs.html?page=${encodeURIComponent(path)}${anchor ? `#${anchor}` : ''}`;

export type Resolved =
  /** Another bundled page (or a place on this one). */
  | { kind: 'page'; path: string; anchor?: string; url: string }
  /** A bundled picture. */
  | { kind: 'asset'; url: string }
  | { kind: 'external'; url: string }
  /** Something in the repository that isn't bundled, like source code. */
  | { kind: 'source'; path: string };

/** Where a link on page `from` goes. */
export function resolveLink(href: string, from: string): Resolved {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//'))
    return { kind: 'external', url: href };
  const [file = '', anchor] = href.split('#') as [string, string | undefined];
  const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : '';
  const path = file ? normalize(dir + decodeURIComponent(file)) : from;
  if (path in PAGES)
    return { kind: 'page', path, ...(anchor ? { anchor } : {}), url: pageUrl(path, anchor) };
  if (path in ASSETS) return { kind: 'asset', url: ASSETS[path]! };
  // The editor serves its public folder beside docs.html (the logo, icons, samples).
  const pub = 'packages/editor/public/';
  if (path.startsWith(pub) && /\.\w+$/.test(path))
    return { kind: 'asset', url: path.slice(pub.length) };
  return { kind: 'source', path };
}

const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth, text }: Tokens.Heading) {
      return `<h${depth} id="${slug(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
    // Mermaid diagrams show as the pictures `pnpm docs:diagrams` renders, one per theme (the CSS
    // in Docs.svelte shows the right one). A diagram without pictures stays code.
    code({ text, lang }: Tokens.Code) {
      const light = lang === 'mermaid' ? ASSETS[diagramFile(text, 'light')] : undefined;
      const dark = lang === 'mermaid' ? ASSETS[diagramFile(text, 'dark')] : undefined;
      if (!light || !dark) return false;
      // Each picture links to itself at full size, since wide ones are scaled down to fit.
      const img = (theme: string, src: string) =>
        `<a class="${theme}" href="${src}" target="_blank" rel="noopener" title="Open full size"><img src="${src}" alt="Diagram" /></a>`;
      return `<figure class="diagram">${img('light', light)}${img('dark', dark)}</figure>\n`;
    },
  },
});

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * A page as HTML. Every `href` and `src` (from markdown or from the HTML inside it) is
 * resolved: pages link to docs.html, pictures to their built files, outside links open in a new
 * tab, and links into the source code become plain text, since the code isn't bundled.
 */
export function renderPage(path: string): string {
  const html = marked.parse(PAGES[path] ?? '', { async: false });
  return html
    .replace(
      /<a href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g,
      (_, href: string, rest: string, body: string) => {
        const r = resolveLink(href.replace(/&amp;/g, '&'), path);
        if (r.kind === 'source')
          return `<span class="source" title="${escapeAttr(r.path)}: in the source code, not in these docs">${body}</span>`;
        const blank = r.kind === 'external' ? ' target="_blank" rel="noopener"' : '';
        return `<a href="${escapeAttr(r.url)}"${rest}${blank}>${body}</a>`;
      },
    )
    .replace(/(<img[^>]*?\ssrc=")([^"]*)"/g, (_, pre: string, src: string) => {
      const r = resolveLink(src, path);
      return `${pre}${escapeAttr(r.kind === 'asset' || r.kind === 'external' ? r.url : src)}"`;
    });
}

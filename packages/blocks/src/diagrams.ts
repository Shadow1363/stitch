/**
 * Mermaid diagrams in the docs. GitHub draws ```mermaid fences itself; `docs.html` shows
 * pictures that `pnpm docs:diagrams` renders from the same text, one per theme, named by a hash
 * of the text so a stale picture is caught without a browser. No imports, so the script can load
 * this file straight from Node.
 */

/** FNV-1a of a docs snippet, as 8 hex digits. */
export function sourceHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

const MERMAID = /^```mermaid\n([\s\S]*?)\n```$/gm;

/** The text of each ```mermaid fence, in order. */
export function diagramsIn(markdown: string): string[] {
  return [...markdown.matchAll(MERMAID)].map((m) => m[1]!);
}

/** Where a diagram's picture lives, repo-relative. */
export function diagramFile(text: string, theme: 'light' | 'dark'): string {
  return `docs/diagrams/${sourceHash(text)}-${theme}.svg`;
}

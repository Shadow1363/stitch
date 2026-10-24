/**
 * Draws assist data (lib/assist.ts) as DOM for CodeMirror's tooltips: hover docs, the
 * completion info panel and signature help. Text goes in through `textContent` only, so names
 * and extension descriptions can't inject markup. Styles are in CodeEditor.svelte's theme.
 */
import { SCOPE_TEXT, type Described } from '@stitch/blocks/registry';
import { KIND_TEXT, type Item, type Signature, type UserInfo } from './assist';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.append(...children);
  return e;
}

/** The docs' light markdown: `code`, **bold** and [links](…) shown as their text. */
function prose(md: string): HTMLElement {
  const p = el('p', 'cm-stitch-prose');
  for (const part of md.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g)) {
    if (!part) continue;
    if (part.startsWith('`')) p.append(el('code', '', part.slice(1, -1)));
    else if (part.startsWith('**')) p.append(el('strong', '', part.slice(2, -2)));
    else if (part.startsWith('[')) p.append(part.slice(1, part.indexOf(']')));
    else p.append(part);
  }
  return p;
}

/** A small block-shaped label in the block's own colour. */
function blockPill(text: string, colour: string | undefined): HTMLElement {
  const b = el('span', 'cm-stitch-block', text);
  if (colour) b.style.background = colour;
  return b;
}

function tags(d: Described): string[] {
  const out: string[] = [d.kind === 'property' ? 'sprite property' : d.kind];
  if (d.yields) out.push('waits');
  if (d.returns) out.push(`reports ${d.returns}`);
  if (d.scope) out.push(`one value for ${SCOPE_TEXT[d.scope]}`);
  if (d.writable !== undefined) out.push(d.writable ? 'read and write' : 'read-only');
  if (d.extension) out.push(`extension: ${d.extension}`);
  return out;
}

function describedView(d: Described): HTMLElement {
  const root = el('div', 'cm-stitch-doc');
  root.append(el('div', 'cm-stitch-sig', el('code', '', d.signature)));
  root.append(el('div', 'cm-stitch-tags', tags(d).join(' · ')));
  if (d.blockText) root.append(el('div', 'cm-stitch-blockrow', blockPill(d.blockText, d.colour)));
  if (d.doc) root.append(prose(d.doc));
  if (d.example) root.append(el('pre', 'cm-stitch-example', d.example));
  return root;
}

function userView(u: UserInfo): HTMLElement {
  const root = el('div', 'cm-stitch-doc');
  const sig = u.kind === 'function' ? `function ${u.name}(${u.params?.join(', ') ?? ''})` : u.name;
  root.append(el('div', 'cm-stitch-sig', el('code', '', sig)));
  const where = u.file ? ` · declared in ${u.file}` : '';
  root.append(el('div', 'cm-stitch-tags', `${KIND_TEXT[u.kind]}${where}`));
  root.append(el('div', 'cm-stitch-hint', 'F12 or ⌘-click to go to its declaration'));
  return root;
}

/** Hover and completion-info content. */
export function infoView(info: NonNullable<Item['info']>): HTMLElement {
  return 'builtin' in info ? describedView(info.builtin) : userView(info.user);
}

/** Signature help: `goto(x, y)` with the current parameter bold, then the block and summary. */
export function signatureView(s: Signature): HTMLElement {
  const sig = el('code', '', `${s.name}(`);
  s.params.forEach((p, i) => {
    if (i) sig.append(', ');
    sig.append(i === s.active ? el('strong', 'cm-stitch-active', p) : p);
  });
  sig.append(')');
  const root = el('div', 'cm-stitch-doc', el('div', 'cm-stitch-sig', sig));
  if (s.blockText) root.append(el('div', 'cm-stitch-blockrow', blockPill(s.blockText, s.colour)));
  if (s.summary) root.append(prose(s.summary));
  return root;
}

<script lang="ts">
  import { defaultKeymap, indentWithTab } from '@codemirror/commands';
  import { bracketMatching, foldGutter, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
  import { forceLinting, lintGutter } from '@codemirror/lint';
  import { Annotation, EditorState, StateEffect, StateField, type Range } from '@codemirror/state';
  import { Decoration, drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, type DecorationSet } from '@codemirror/view';
  import type { Catalog, FileContext } from '@stitch/ir';
  import { stitch, stitchAssist, stitchLinter, type AssistSource } from '@stitch/lang/codemirror';
  import { completions, hoverInfo, signature, type AssistData } from './assist';
  import { infoView, signatureView } from './assist-view';
  import { tags as t } from '@lezer/highlight';
  import { onMount } from 'svelte';

  interface Props {
    /** Changing this swaps the document (e.g. switching sprites). */
    docKey: string;
    text: string;
    globals: () => ReadonlySet<string>;
    /** Builtins including the cart's extensions, for lint. */
    catalog: () => Catalog;
    /** The cart's names, for completion, hover and the cart-name lint. */
    assist: () => AssistData;
    lintContext: () => FileContext | undefined;
    /** Go to a name declared in another file; true when found. */
    ongoto: (name: string) => boolean;
    /** The user moved the cursor (for linking with the blocks). */
    oncursor?: (pos: number) => void;
    /** The user scrolled: the position at the top of the view. */
    onscroll?: (pos: number) => void;
    onchange: (text: string) => void;
    /** Undo/redo go to the shared history (text and blocks), not CodeMirror's own. */
    onundo: () => void;
    onredo: () => void;
  }
  let { docKey, text, globals, catalog, assist, lintContext, ongoto, oncursor, onscroll, onchange, onundo, onredo }: Props = $props();

  /** Lines linked to the block selected in the blocks view; cleared by any edit. */
  const setLinked = StateEffect.define<{ from: number; to: number } | null>();
  const linkedLine = Decoration.line({ class: 'cm-linked' });
  const linked = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
      for (const e of tr.effects)
        if (e.is(setLinked)) {
          if (!e.value) return Decoration.none;
          const doc = tr.state.doc;
          const first = doc.lineAt(Math.min(e.value.from, doc.length)).number;
          const last = doc.lineAt(Math.min(e.value.to, doc.length)).number;
          const lines: Range<Decoration>[] = [];
          for (let n = first; n <= last; n++) lines.push(linkedLine.range(doc.line(n).from));
          return Decoration.set(lines);
        }
      return tr.docChanged ? Decoration.none : deco;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
  /** Scrolls this editor makes itself don't count as the user's. */
  let quietUntil = 0;

  /** Completions, signatures and hovers from the registry and the cart (lib/assist.ts). */
  const source: AssistSource = {
    completions: (ctx, scope) =>
      completions(ctx, scope, assist()).map(({ info, ...i }) => (info ? { ...i, info: () => infoView(info) } : i)),
    signature: (call, scope) => {
      const s = signature(call, scope, assist());
      return s ? signatureView(s) : null;
    },
    hover: (name, scope) => {
      const i = hoverInfo(name, scope, assist());
      return i ? infoView(i) : null;
    },
    gotoElsewhere: (name) => ongoto(name),
  };

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let shownKey = '';
  /** Marks transactions that come from outside (blocks edits, undo), so they don't echo back. */
  const external = Annotation.define<boolean>();

  /** Syntax colours as tokens, so one style serves both themes. */
  const highlight = HighlightStyle.define([
    { tag: [t.definitionKeyword, t.keyword, t.operatorKeyword], color: 'var(--code-keyword)', fontWeight: '700' },
    { tag: t.controlKeyword, color: 'var(--code-control)', fontWeight: '700' },
    { tag: [t.bool, t.number], color: 'var(--code-number)' },
    { tag: t.string, color: 'var(--code-string)' },
    { tag: t.lineComment, color: 'var(--code-comment)', fontStyle: 'italic' },
    { tag: t.function(t.variableName), color: 'var(--code-function)' },
    { tag: [t.definition(t.variableName), t.function(t.definition(t.variableName))], color: 'var(--code-def)' },
    { tag: t.variableName, color: 'var(--code-name)' },
  ]);

  const chrome = EditorView.theme({
    '&': { height: '100%', fontSize: '14px', background: 'var(--panel)', color: 'var(--code-name)' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55' },
    '.cm-content': { caretColor: 'var(--text)' },
    '.cm-cursor': { borderLeftColor: 'var(--text)' },
    '.cm-gutters': { background: 'var(--panel)', color: 'var(--muted)', borderRight: '1px solid var(--line)' },
    '.cm-activeLine': { background: 'var(--code-active-line)' },
    '.cm-linked, .cm-linked.cm-activeLine': { background: 'var(--code-linked)' },
    '.cm-activeLineGutter': { background: 'var(--code-active-line)', color: 'var(--text)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { background: 'var(--code-selection) !important' },
    '&.cm-focused .cm-matchingBracket': { background: 'var(--code-selection)', outline: '1px solid var(--line-strong)' },
    '.cm-tooltip': { background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius)' },
    '.cm-diagnostic-error': { borderLeftColor: 'var(--bad)' },
    '.cm-diagnostic-warning': { borderLeftColor: 'var(--warn)' },
    '.cm-foldPlaceholder': { background: 'var(--well)', border: '1px solid var(--line)', color: 'var(--muted)' },
    // Completion list, info panel, signature help and hovers.
    '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-mono)', maxHeight: '16em' },
    '.cm-tooltip-autocomplete ul li[aria-selected]': { background: 'var(--accent)', color: 'var(--on-accent)' },
    '.cm-tooltip-autocomplete ul li[aria-selected] .cm-completionDetail': { color: 'var(--on-accent)' },
    '.cm-completionDetail': { color: 'var(--muted)', fontStyle: 'normal', fontFamily: 'var(--font-ui)', marginLeft: '1em' },
    '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '700' },
    '.cm-completionIcon': { color: 'var(--muted)' },
    '.cm-tooltip.cm-completionInfo': { padding: '0', maxWidth: '380px' },
    '.cm-stitch-doc': { padding: '8px 10px', maxWidth: '380px', fontFamily: 'var(--font-ui)', fontSize: '13px', lineHeight: '1.45' },
    '.cm-stitch-sig': { fontFamily: 'var(--font-mono)', fontWeight: '600' },
    '.cm-stitch-active': { color: 'var(--accent)', textDecoration: 'underline' },
    '.cm-stitch-tags, .cm-stitch-hint': { color: 'var(--muted)', fontSize: '12px', marginTop: '2px' },
    '.cm-stitch-blockrow': { margin: '6px 0 2px' },
    '.cm-stitch-block': { display: 'inline-block', padding: '2px 8px', borderRadius: '4px 10px 10px 4px', color: 'var(--on-block)', fontSize: '12px', fontWeight: '600' },
    '.cm-stitch-prose': { margin: '6px 0 0' },
    '.cm-stitch-prose code, .cm-stitch-example': { fontFamily: 'var(--font-mono)', fontSize: '12px' },
    '.cm-stitch-example': { margin: '6px 0 0', padding: '6px 8px', background: 'var(--well)', borderRadius: 'var(--radius-s)', whiteSpace: 'pre', overflowX: 'auto' },
  });

  const makeState = (doc: string) =>
    EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        foldGutter(),
        lintGutter(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        syntaxHighlighting(highlight),
        keymap.of([
          { key: 'Mod-z', run: () => (onundo(), true), preventDefault: true },
          { key: 'Mod-Shift-z', run: () => (onredo(), true), preventDefault: true },
          { key: 'Mod-y', run: () => (onredo(), true), preventDefault: true },
          indentWithTab,
          ...defaultKeymap,
        ]),
        EditorState.tabSize.of(2),
        stitch(),
        stitchLinter(() => globals(), () => catalog(), () => lintContext()),
        stitchAssist(source),
        EditorView.updateListener.of((u) => {
          const mine = !u.transactions.some((t) => t.annotation(external));
          if (u.docChanged && mine) onchange(u.state.doc.toString());
          if (u.selectionSet && mine && u.transactions.some((t) => t.isUserEvent('select') || t.isUserEvent('input') || t.isUserEvent('move')))
            oncursor?.(u.state.selection.main.head);
        }),
        linked,
        chrome,
      ],
    });

  onMount(() => {
    view = new EditorView({ state: makeState(text), parent: host });
    shownKey = docKey;
    const v = view;
    v.scrollDOM.addEventListener('scroll', () => {
      if (performance.now() >= quietUntil) onscroll?.(v.lineBlockAtHeight(v.scrollDOM.scrollTop).from);
    });
    return () => view?.destroy();
  });

  $effect(() => {
    if (view && docKey !== shownKey) {
      shownKey = docKey;
      view.setState(makeState(text));
    }
  });

  /** Replaces the text from outside, keeping the cursor near where it was. */
  export function setText(next: string) {
    if (!view) return;
    const cur = view.state.doc.toString();
    if (cur === next) return;
    // Replace only the changed middle so the cursor and scroll stay put.
    let start = 0;
    while (start < cur.length && start < next.length && cur[start] === next[start]) start++;
    let endCur = cur.length;
    let endNext = next.length;
    while (endCur > start && endNext > start && cur[endCur - 1] === next[endNext - 1]) {
      endCur--;
      endNext--;
    }
    view.dispatch({ changes: { from: start, to: endCur, insert: next.slice(start, endNext) }, annotations: external.of(true) });
  }

  /**
   * Marks the lines of a range as linked to the selected block (none for undefined) and scrolls
   * them into view: just enough (`nearest`), or to the top of the view (`top`).
   */
  export function link(range: { from: number; to: number } | undefined, at: 'nearest' | 'top' = 'nearest') {
    if (!view) return;
    const effects: StateEffect<unknown>[] = [setLinked.of(range ?? null)];
    if (range) {
      quietUntil = performance.now() + 300;
      effects.push(EditorView.scrollIntoView(Math.min(range.from, view.state.doc.length), { y: at === 'top' ? 'start' : 'nearest', yMargin: 24 }));
    }
    view.dispatch({ effects });
  }

  /** Re-checks the text now, e.g. after the catalog changed (extensions added or removed). */
  export function relint() {
    if (view) forceLinting(view);
  }

  /** Moves the cursor to a source range (used for runtime errors). */
  export function reveal(from: number, to: number) {
    if (!view) return;
    const len = view.state.doc.length;
    view.dispatch({ selection: { anchor: Math.min(from, len), head: Math.min(to, len) }, scrollIntoView: true });
    view.focus();
  }
</script>

<div class="code" bind:this={host}></div>

<style>
  .code {
    height: 100%;
    overflow: hidden;
    background: var(--panel);
  }
</style>

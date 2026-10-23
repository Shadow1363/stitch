<script lang="ts">
  import { defaultKeymap, indentWithTab } from '@codemirror/commands';
  import { bracketMatching, defaultHighlightStyle, foldGutter, indentOnInput, syntaxHighlighting } from '@codemirror/language';
  import { lintGutter } from '@codemirror/lint';
  import { Annotation, EditorState } from '@codemirror/state';
  import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
  import { stitch, stitchLinter } from '@stitch/lang/codemirror';
  import { onMount } from 'svelte';

  interface Props {
    /** Changing this swaps the document (e.g. switching sprites). */
    docKey: string;
    text: string;
    globals: () => ReadonlySet<string>;
    onchange: (text: string) => void;
    /** Undo/redo go to the shared history (text and blocks), not CodeMirror's own. */
    onundo: () => void;
    onredo: () => void;
  }
  let { docKey, text, globals, onchange, onundo, onredo }: Props = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let shownKey = '';
  /** Marks transactions that come from outside (blocks edits, undo), so they don't echo back. */
  const external = Annotation.define<boolean>();

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
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([
          { key: 'Mod-z', run: () => (onundo(), true), preventDefault: true },
          { key: 'Mod-Shift-z', run: () => (onredo(), true), preventDefault: true },
          { key: 'Mod-y', run: () => (onredo(), true), preventDefault: true },
          indentWithTab,
          ...defaultKeymap,
        ]),
        EditorState.tabSize.of(2),
        stitch(),
        stitchLinter(() => globals()),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !u.transactions.some((t) => t.annotation(external))) onchange(u.state.doc.toString());
        }),
        EditorView.theme({ '&': { height: '100%', fontSize: '14px' }, '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }),
      ],
    });

  onMount(() => {
    view = new EditorView({ state: makeState(text), parent: host });
    shownKey = docKey;
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
    /* The highlight style is light-only, so the editor stays light in dark mode. */
    background: #fff;
    color: #1d1d1f;
  }
</style>

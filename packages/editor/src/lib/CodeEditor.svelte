<script lang="ts">
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
  import { bracketMatching, defaultHighlightStyle, foldGutter, indentOnInput, syntaxHighlighting } from '@codemirror/language';
  import { lintGutter } from '@codemirror/lint';
  import { EditorState } from '@codemirror/state';
  import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
  import { stitch, stitchLinter } from '@stitch/lang/codemirror';
  import { onMount } from 'svelte';

  interface Props {
    /** Changing this swaps the document (e.g. switching sprites). */
    docKey: string;
    text: string;
    globals: () => ReadonlySet<string>;
    onchange: (text: string) => void;
  }
  let { docKey, text, globals, onchange }: Props = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let shownKey = '';

  const makeState = (doc: string) =>
    EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        foldGutter(),
        lintGutter(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        EditorState.tabSize.of(2),
        stitch(),
        stitchLinter(() => globals()),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onchange(u.state.doc.toString());
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
    /* The Phase 1 highlight style is light-only, so the editor stays light in dark mode. */
    background: #fff;
    color: #1d1d1f;
  }
</style>

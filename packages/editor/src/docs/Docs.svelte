<script lang="ts">
  import { ArrowLeft } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import Logo from '../lib/Logo.svelte';
  import { HOME, navigation, pageUrl, PAGES, renderPage, titleOf } from './pages';

  const asked = new URLSearchParams(location.search).get('page') ?? HOME;
  const page = asked in PAGES ? asked : HOME;
  const html = renderPage(page);
  const nav = navigation();
  document.title = `${titleOf(page)} · Stitch docs`;

  let article: HTMLElement;

  // The browser can't jump to an anchor before the page is drawn, so do it once it is.
  onMount(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
    else article.focus();
  });
</script>

<div class="docs">
  <header>
    <a class="brand" href={pageUrl(HOME)}><Logo size={22} /><span>Stitch docs</span></a>
    <div class="spacer"></div>
    <a class="back" href="./"><ArrowLeft />Open the editor</a>
  </header>
  <div class="body">
    <nav aria-label="Pages">
      {#each nav as g (g.group)}
        <h2>{g.group}</h2>
        <ul>
          {#each g.pages as p (p)}
            <li><a href={pageUrl(p)} aria-current={p === page ? 'page' : undefined}>{titleOf(p)}</a></li>
          {/each}
        </ul>
      {/each}
    </nav>
    <!-- The docs are this repository's own markdown, rendered at build time (pages.ts). -->
    <article bind:this={article} tabindex="-1">{@html html}</article>
  </div>
</div>

<style>
  .docs { display: flex; flex-direction: column; height: 100vh; }
  header { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); background: var(--chrome); border-bottom: 1px solid var(--line); }
  .brand { display: inline-flex; align-items: center; gap: var(--space-2); font-weight: 700; font-size: 15px; color: var(--text); text-decoration: none; }
  .spacer { flex: 1; }
  .back { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--link); }
  .back :global(svg) { width: 1.1em; height: 1.1em; }
  .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 240px minmax(0, 1fr); }
  nav { overflow: auto; padding: var(--space-3); border-right: 1px solid var(--line); background: var(--chrome); font-size: 14px; }
  nav h2 { font-size: var(--text-s); text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: var(--space-3) 0 var(--space-1); }
  nav ul { list-style: none; margin: 0; padding: 0; }
  nav a { display: block; padding: 3px var(--space-2); border-radius: var(--radius); color: var(--text); text-decoration: none; }
  nav a:hover { background: var(--well); }
  nav a[aria-current='page'] { background: var(--accent); color: var(--on-accent); }
  article { overflow: auto; padding: var(--space-5) clamp(16px, 4vw, 48px); line-height: 1.6; outline: none; background: var(--panel); }
  article > :global(*) { max-width: 900px; }
  article :global(a) { color: var(--link); }
  article :global(.source) { border-bottom: 1px dotted var(--muted); cursor: help; }
  article :global(h1), article :global(h2), article :global(h3) { line-height: 1.25; scroll-margin-top: var(--space-3); }
  article :global(h2) { border-bottom: 1px solid var(--line); padding-bottom: var(--space-1); margin-top: 2em; }
  article :global(code) { font-family: var(--font-mono); font-size: 0.9em; background: var(--well); padding: 1px 4px; border-radius: var(--radius-s); }
  article :global(pre) { background: var(--well); padding: var(--space-3); border-radius: var(--radius); overflow: auto; }
  article :global(pre code) { background: none; padding: 0; }
  article :global(table) { border-collapse: collapse; margin: var(--space-3) 0; }
  article :global(th), article :global(td) { border: 1px solid var(--line); padding: var(--space-1) var(--space-2); vertical-align: top; text-align: left; }
  article :global(img) { max-width: 100%; height: auto; }
  /* Mermaid diagrams: one picture per theme (pages.ts), scrolling sideways on narrow screens. */
  article :global(.diagram) { margin: var(--space-4) 0; overflow-x: auto; }
  article :global(.diagram img) { display: block; margin: 0 auto; }
  :global(html[data-theme='dark']) article :global(.diagram .light),
  :global(html:not([data-theme='dark'])) article :global(.diagram .dark) { display: none; }
  article :global(blockquote) { margin: 0; padding-left: var(--space-3); border-left: 3px solid var(--line-strong); color: var(--muted); }
  @media (max-width: 720px) {
    .body { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
    nav { max-height: 30vh; border-right: none; border-bottom: 1px solid var(--line); }
  }
</style>

<script lang="ts">
  import { dialogs, type DialogRequest } from './dialog.svelte';

  const current = $derived(dialogs.queue[0]);
  let el = $state<HTMLDialogElement>();
  let text = $state('');

  $effect(() => {
    if (!current || !el) return;
    text = current.input?.value ?? '';
    if (!el.open) el.showModal();
  });

  function answer(d: DialogRequest, value: string | boolean | undefined) {
    if (dialogs.queue[0] !== d) return;
    dialogs.queue.shift();
    if (!dialogs.queue.length) el?.close();
    d.resolve(value);
  }

  const accept = (d: DialogRequest) => answer(d, d.input ? text : true);
  const dismiss = (d: DialogRequest) => answer(d, d.input ? undefined : d.cancel ? false : true);
</script>

{#if current}
  {@const d = current}
  <dialog
    bind:this={el}
    aria-labelledby="dialog-title"
    oncancel={(e) => {
      e.preventDefault();
      dismiss(d);
    }}
  >
    <form
      method="dialog"
      onsubmit={(e) => {
        e.preventDefault();
        accept(d);
      }}
    >
      <h2 id="dialog-title">{d.title}</h2>
      {#if d.message || d.code}
        <p>{d.message ?? ''}{#if d.code}{' '}<code>{d.code}</code>{/if}</p>
      {/if}
      {#if d.note}<p>{d.note}</p>{/if}
      {#if d.input}
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={text} aria-label={d.input.label} placeholder={d.input.placeholder} autofocus spellcheck="false" />
      {/if}
      <div class="row">
        {#if d.cancel}
          <button type="button" onclick={() => dismiss(d)}>{d.cancel}</button>
        {/if}
        <!-- svelte-ignore a11y_autofocus -->
        <button type="submit" class="ok" class:danger={d.danger} autofocus={!d.input}>{d.ok}</button>
      </div>
    </form>
  </dialog>
{/if}

<style>
  dialog {
    border: 1px solid var(--line);
    border-radius: var(--radius-xl);
    background: var(--panel);
    color: var(--text);
    padding: var(--space-4) var(--space-5);
    width: min(440px, calc(100vw - 32px));
    box-sizing: border-box;
    box-shadow: var(--shadow);
  }
  dialog::backdrop { background: var(--overlay); }
  h2 { margin: 0 0 var(--space-2); font-size: 16px; font-weight: 600; }
  p { margin: 0 0 var(--space-3); color: var(--muted); font-size: var(--text-m); line-height: 1.5; white-space: pre-line; overflow-wrap: anywhere; }
  code { color: var(--text); }
  input { width: 100%; box-sizing: border-box; margin-bottom: var(--space-3); }
  .row { display: flex; justify-content: flex-end; gap: var(--space-2); }
  .ok { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }
  .ok.danger { background: var(--bad); border-color: var(--bad); color: var(--on-bad); }
</style>

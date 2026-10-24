<script lang="ts">
  import { SECRET_NAME, type Secret } from './secrets';
  import { ask } from './dialog.svelte';

  interface Props {
    /** Kept in this browser only; never part of the cart. */
    secrets: Secret[];
    onsecrets: (list: Secret[]) => void;
    /** Hosts this cart was allowed to reach. */
    hosts: string[];
    onrevoke: (host: string) => void;
  }
  let { secrets, onsecrets, hosts, onrevoke }: Props = $props();

  let shown = $state<Record<number, boolean>>({});

  const splitHosts = (v: string) =>
    v
      .split(/[\s,]+/)
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);

  function update(i: number, patch: Partial<Secret>) {
    onsecrets(secrets.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  function setHeader(i: number, name: string, template: string) {
    const { header: _drop, ...rest } = secrets[i]!;
    onsecrets(secrets.map((s, j) => (j === i ? (name.trim() ? { ...rest, header: { name: name.trim(), template } } : rest) : s)));
  }

  function add() {
    let n = secrets.length + 1;
    while (secrets.some((s) => s.name === `KEY_${n}`)) n++;
    onsecrets([...secrets, { name: `KEY_${n}`, value: '', hosts: [] }]);
  }

  async function remove(i: number) {
    const s = secrets[i]!;
    if (await ask(`Delete the secret ${s.name}?`, { message: 'It is removed from this browser.', ok: 'Delete', danger: true }))
      onsecrets(secrets.filter((x) => x !== s));
  }
</script>

<section>
  <h3>Network and secrets</h3>
  <p class="muted">
    Scripts reach the web with <code>http_get</code> and <code>http_post</code>. The editor makes each request and asks before a cart first contacts a host.
    Secrets stay in this browser and are never saved in carts. A secret is sent only to its hosts, as <code>{'{{NAME}}'}</code> in a URL or body, or as a header.
  </p>

  {#each secrets as s, i (i)}
    {@const badName = !SECRET_NAME.test(s.name)}
    <div class="secret">
      <label>Name <input class="mono" class:bad={badName} value={s.name} onchange={(e) => update(i, { name: (e.target as HTMLInputElement).value.trim() })} /></label>
      <label
        >Value
        <span class="pair">
          <input class="mono" type={shown[i] ? 'text' : 'password'} autocomplete="off" value={s.value} onchange={(e) => update(i, { value: (e.target as HTMLInputElement).value })} />
          <button onclick={() => (shown[i] = !shown[i])}>{shown[i] ? 'Hide' : 'Show'}</button>
        </span>
      </label>
      <label>Hosts <input class="mono" placeholder="api.example.com, *.example.org" value={s.hosts.join(', ')} onchange={(e) => update(i, { hosts: splitHosts((e.target as HTMLInputElement).value) })} /></label>
      <label
        >Header
        <span class="pair">
          <input class="mono narrow" placeholder="Authorization" value={s.header?.name ?? ''} onchange={(e) => setHeader(i, (e.target as HTMLInputElement).value, s.header?.template ?? 'Bearer {value}')} />
          <input class="mono" placeholder={'Bearer {value}'} value={s.header?.template ?? ''} disabled={!s.header} onchange={(e) => setHeader(i, s.header?.name ?? '', (e.target as HTMLInputElement).value)} />
        </span>
      </label>
      {#if badName}<p class="error">Names are letters, digits and _, not starting with a digit.</p>{/if}
      {#if !s.hosts.length}<p class="muted">No hosts yet, so this secret is never sent.</p>{/if}
      <div class="row"><button onclick={() => remove(i)}>Delete secret</button></div>
    </div>
  {/each}
  <div class="row"><button onclick={add}>Add secret</button></div>

  <h4>Hosts this cart may reach</h4>
  {#each hosts as h (h)}
    <div class="host"><code>{h}</code><button onclick={() => onrevoke(h)}>Revoke</button></div>
  {:else}
    <p class="muted">None yet. Opening another cart starts with none.</p>
  {/each}
</section>

<style>
  section { display: flex; flex-direction: column; gap: 8px; }
  h3 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  h4 { margin: 8px 0 0; font-size: 13px; }
  .secret { display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); }
  label { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 13px; }
  input { font: inherit; padding: 4px 6px; border: 1px solid var(--line); border-radius: var(--radius); width: 260px; box-sizing: border-box; }
  .pair { display: flex; gap: 6px; width: 260px; }
  .pair input { width: auto; flex: 1; min-width: 0; }
  .pair input.narrow { flex: 0 0 110px; }
  input.bad { border-color: var(--bad); }
  .mono, code { font-family: var(--font-mono); }
  .row { display: flex; gap: 6px; }
  .host { display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
  .muted { color: var(--muted); font-size: 12px; margin: 0; }
  .error { color: var(--bad); font-size: 12px; margin: 0; }
</style>

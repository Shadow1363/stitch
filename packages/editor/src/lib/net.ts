/**
 * The editor end of the stage's HTTP requests. The sandboxed stage has an opaque origin and
 * no secrets, so it asks over the bridge; this checks the request, asks the user once per host,
 * adds secrets, fetches with limits, and scrubs secrets from the reply. Everything but the
 * secrets is the runtime's `FetchNet`, which exported players use too.
 */
import { FetchNet, type FetchNetOptions } from '@stitch/runtime/fetch-net';
import { applySecrets, type Secret } from './secrets';

export interface NetProxyOptions extends Omit<FetchNetOptions, 'prepare'> {
  secrets: () => readonly Secret[];
}

export class NetProxy extends FetchNet {
  constructor({ secrets, ...opts }: NetProxyOptions) {
    super({
      ...opts,
      prepare: (url, body) => {
        const p = applySecrets(url, body, secrets());
        if ('error' in p) return p;
        return { url: p.url, body: p.body, headers: p.headers, hidden: p.used.map((s) => s.value) };
      },
    });
  }
}

/** The desktop app's fetch: Tauri's HTTP plugin makes requests natively, so CORS doesn't apply. */
export function nativeFetch(): typeof fetch | undefined {
  const tauri = (globalThis as { __TAURI__?: { http?: { fetch?: typeof fetch } } }).__TAURI__;
  return tauri?.http?.fetch;
}

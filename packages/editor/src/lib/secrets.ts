/**
 * Secrets: API keys kept in this browser (IndexedDB, the editor's origin). They are never part
 * of a cart, a session or an export. The HTTP proxy (net.ts) adds them to requests for the
 * hosts each one allows, so the sandboxed stage never sees a value.
 */
import { hide } from '@stitch/runtime/fetch-net';
import { kvGet, kvSet } from './storage';

export interface Secret {
  /** Referenced as `{{NAME}}` in a request URL or body. */
  name: string;
  value: string;
  /** Hosts it may be sent to: `api.example.com`, or `*.example.com` for subdomains. */
  hosts: string[];
  /** Added to every request to an allowed host, e.g. `Authorization` / `Bearer {value}`. */
  header?: { name: string; template: string };
}

export const SECRET_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const KEY = 'secrets';

export async function loadSecrets(): Promise<Secret[]> {
  return (await kvGet<Secret[]>(KEY)) ?? [];
}

export function saveSecrets(list: Secret[]): Promise<void> {
  // Plain copies: Svelte state proxies can't be structured-cloned into IndexedDB.
  return kvSet(KEY, JSON.parse(JSON.stringify(list)) as Secret[]);
}

/** `host` is a URL host (with port, if any). */
export function hostAllowed(s: Secret, host: string): boolean {
  const h = host.toLowerCase();
  return s.hosts.some((p) => {
    const pat = p.trim().toLowerCase();
    if (pat.startsWith('*.')) return h.endsWith(pat.slice(1)) && h.length > pat.length - 1;
    return pat !== '' && h === pat;
  });
}

export interface Prepared {
  url: string;
  body: string | undefined;
  headers: Record<string, string>;
  /** Secrets this request carries; their values are scrubbed from the response. */
  used: Secret[];
}

/**
 * Fills `{{NAME}}` placeholders and adds header secrets for the request's host. A placeholder
 * for an unknown secret, or one not allowed for this host, refuses the whole request, so a cart
 * can't send a key somewhere its owner didn't allow.
 */
export function applySecrets(
  url: string,
  body: string | undefined,
  secrets: readonly Secret[],
): Prepared | { error: string } {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return { error: `not a URL: ${url}` };
  }
  const used = new Set<Secret>();
  let error: string | undefined;
  const fill = (text: string, encode: boolean) =>
    text.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (all, name: string) => {
      const s = secrets.find((x) => x.name === name);
      if (!s) error ??= `no secret named ${name}`;
      else if (!hostAllowed(s, host)) error ??= `secret ${name} isn't allowed for ${host}`;
      else {
        used.add(s);
        return encode ? encodeURIComponent(s.value) : s.value;
      }
      return all;
    });
  const outUrl = fill(url, true);
  const outBody = body === undefined ? undefined : fill(body, false);
  if (error) return { error };
  if (new URL(outUrl).host !== host) return { error: 'a secret changed the request host' };
  const headers: Record<string, string> = {};
  for (const s of secrets) {
    if (!s.header || !s.header.name.trim() || !hostAllowed(s, host)) continue;
    headers[s.header.name.trim()] = s.header.template.split('{value}').join(s.value);
    used.add(s);
  }
  return { url: outUrl, body: outBody, headers, used: [...used] };
}

/** Removes secret values (raw and URL-encoded) that a server echoed back. */
export function scrub(text: string, used: readonly Secret[]): string {
  return hide(
    text,
    used.map((s) => s.value),
  );
}

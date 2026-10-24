/**
 * Fetches scripts' HTTP requests with permission and limits. The editor's proxy uses it with a
 * `prepare` step that adds secrets; exported players use it as is, with no secrets at all.
 */
import type { HttpRequest, HttpResponse, NetOut } from '../core/net';

/** A request after `prepare`: what to send, and which values to scrub from what comes back. */
export interface PreparedRequest {
  url: string;
  body: string | undefined;
  headers: Record<string, string>;
  /** Values the request carries that must never reach the script (secrets). */
  hidden: string[];
}

export interface FetchNetOptions {
  /** May this cart reach `host`? Asked once per host; the answer is cached. */
  allowHost: (host: string) => Promise<boolean>;
  /** Why a request failed before reaching the server, for the console. */
  log: (text: string) => void;
  /** Adds headers or fills placeholders; an error refuses the request. */
  prepare?: (url: string, body: string | undefined) => PreparedRequest | { error: string };
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  maxInFlight?: number;
}

const FAILED: HttpResponse = { status: 0, body: '' };

export class FetchNet implements NetOut {
  private answers = new Map<string, Promise<boolean>>();
  /** Answers already given, by host. */
  private settled = new Map<string, boolean>();
  private inFlight = 0;
  private queue: (() => void)[] = [];

  constructor(private opts: FetchNetOptions) {}

  /** Hosts this cart may reach. */
  get allowedHosts(): string[] {
    return [...this.settled].filter(([, ok]) => ok).map(([h]) => h);
  }

  /** Starts over with these hosts allowed (opening another cart forgets the old answers). */
  reset(allowed: readonly string[] = []): void {
    this.answers = new Map(allowed.map((h) => [h, Promise.resolve(true)]));
    this.settled = new Map(allowed.map((h) => [h, true]));
  }

  request(req: HttpRequest): Promise<HttpResponse> {
    return this.handle(req);
  }

  async handle(req: HttpRequest): Promise<HttpResponse> {
    let url: URL;
    try {
      url = new URL(req.url);
    } catch {
      return this.fail(`HTTP: not a URL: ${req.url}`);
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:')
      return this.fail(`HTTP: only http and https URLs work (${req.url})`);
    if (req.method !== 'GET' && req.method !== 'POST')
      return this.fail(`HTTP: unsupported method ${String(req.method)}`);
    if (!(await this.ask(url.host)))
      return this.fail(`HTTP: ${url.host} isn't allowed for this cart`);

    const prepared = this.opts.prepare
      ? this.opts.prepare(req.url, req.body)
      : { url: req.url, body: req.body, headers: {}, hidden: [] };
    if ('error' in prepared) return this.fail(`HTTP: ${prepared.error}`);

    await this.slot();
    try {
      return await this.fetch(req.method, prepared);
    } finally {
      this.release();
    }
  }

  private ask(host: string): Promise<boolean> {
    let p = this.answers.get(host);
    if (!p) {
      p = this.opts.allowHost(host).then(
        (ok) => (this.settled.set(host, ok), ok),
        () => false,
      );
      this.answers.set(host, p);
    }
    return p;
  }

  private async fetch(method: 'GET' | 'POST', p: PreparedRequest): Promise<HttpResponse> {
    const ctl = new AbortController();
    const timeoutMs = this.opts.timeoutMs ?? 10_000;
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const headers = { ...p.headers };
    if (method === 'POST' && p.body !== undefined)
      headers['Content-Type'] = isJson(p.body) ? 'application/json' : 'text/plain;charset=utf-8';
    try {
      const res = await (this.opts.fetch ?? fetch)(p.url, {
        method,
        headers,
        ...(method === 'POST' ? { body: p.body ?? '' } : {}),
        signal: ctl.signal,
        credentials: 'omit',
        // A redirect could carry an added header to another host.
        redirect: p.hidden.length ? 'error' : 'follow',
      });
      const max = this.opts.maxBytes ?? 1_000_000;
      const body = await readCapped(res, max);
      if (body === undefined) {
        ctl.abort();
        return this.fail(`HTTP: the reply from ${new URL(p.url).host} is over ${max} bytes`);
      }
      return { status: res.status, body: hide(body, p.hidden) };
    } catch (e) {
      const why = ctl.signal.aborted
        ? `timed out after ${timeoutMs / 1000} s`
        : `${hide(e instanceof Error ? e.message : String(e), p.hidden)} (offline, or the server doesn't allow cross-origin requests: see docs/network.md)`;
      return this.fail(`HTTP: ${method} ${hide(p.url, p.hidden)} failed: ${why}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private fail(text: string): HttpResponse {
    this.opts.log(text);
    return FAILED;
  }

  private slot(): Promise<void> {
    if (this.inFlight < (this.opts.maxInFlight ?? 8)) {
      this.inFlight++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) next();
    else this.inFlight--;
  }
}

/** Replaces each hidden value, raw and URL-encoded, with `•••`. Values under 4 characters are skipped. */
export function hide(text: string, hidden: readonly string[]): string {
  let out = text;
  for (const value of hidden) {
    if (value.length < 4) continue;
    for (const v of new Set([value, encodeURIComponent(value)])) out = out.split(v).join('•••');
  }
  return out;
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** The body as text, or undefined once it passes `max` bytes. */
async function readCapped(res: Response, max: number): Promise<string | undefined> {
  if (Number(res.headers.get('content-length') ?? 0) > max) return undefined;
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      void reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

import { describe, expect, it, vi } from 'vitest';
import { NetProxy, type NetProxyOptions } from './net';
import { applySecrets, hostAllowed, scrub, type Secret } from './secrets';

const key: Secret = {
  name: 'WEATHER_KEY',
  value: 'k3y/with+chars',
  hosts: ['api.weather.test'],
};
const bearer: Secret = {
  name: 'AI',
  value: 'sk-secret-value',
  hosts: ['*.ai.test'],
  header: { name: 'Authorization', template: 'Bearer {value}' },
};

describe('secrets', () => {
  it('match hosts exactly or by subdomain wildcard', () => {
    expect(hostAllowed(key, 'api.weather.test')).toBe(true);
    expect(hostAllowed(key, 'evil.test')).toBe(false);
    expect(hostAllowed(bearer, 'api.ai.test')).toBe(true);
    expect(hostAllowed(bearer, 'ai.test')).toBe(false);
    expect(hostAllowed(bearer, 'notai.test')).toBe(false);
  });

  it('fill placeholders (URL-encoded in the URL) and add header secrets for the host', () => {
    const r = applySecrets(
      'https://api.weather.test/now?key={{WEATHER_KEY}}',
      '{"k":"{{ WEATHER_KEY }}"}',
      [key, bearer],
    );
    expect(r).toEqual({
      url: 'https://api.weather.test/now?key=k3y%2Fwith%2Bchars',
      body: '{"k":"k3y/with+chars"}',
      headers: {},
      used: [key],
    });
    const h = applySecrets('https://api.ai.test/v1', undefined, [key, bearer]);
    expect(h).toMatchObject({
      headers: { Authorization: 'Bearer sk-secret-value' },
      used: [bearer],
    });
  });

  it('refuse to send a secret to a host it does not allow', () => {
    expect(applySecrets('https://evil.test/?k={{WEATHER_KEY}}', undefined, [key])).toEqual({
      error: "secret WEATHER_KEY isn't allowed for evil.test",
    });
    expect(applySecrets('https://evil.test/', '{{AI}}', [bearer])).toHaveProperty('error');
    expect(applySecrets('https://x.test/{{NOPE}}', undefined, [])).toEqual({
      error: 'no secret named NOPE',
    });
  });

  it('scrub echoed values', () => {
    expect(scrub('you sent k3y/with+chars and k3y%2Fwith%2Bchars', [key])).toBe(
      'you sent ••• and •••',
    );
  });
});

const ok = (body: string, status = 200) => Promise.resolve(new Response(body, { status }));

function proxy(over: Partial<NetProxyOptions> = {}) {
  const log: string[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(() => ok('hello'));
  const allowHost = vi.fn(() => Promise.resolve(true));
  const p = new NetProxy({
    secrets: () => [key, bearer],
    allowHost,
    log: (t) => log.push(t),
    fetch,
    ...over,
  });
  return { p, log, fetch: (over.fetch as typeof fetch | undefined) ?? fetch, allowHost };
}

describe('NetProxy', () => {
  it('fetches with secrets added and no cookies, and returns status and body', async () => {
    const { p, fetch } = proxy();
    const r = await p.handle({ method: 'POST', url: 'https://api.ai.test/v1', body: '{"a":1}' });
    expect(r).toEqual({ status: 200, body: 'hello' });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.ai.test/v1');
    expect(init).toMatchObject({
      method: 'POST',
      body: '{"a":1}',
      credentials: 'omit',
      redirect: 'error',
      headers: { Authorization: 'Bearer sk-secret-value', 'Content-Type': 'application/json' },
    });
  });

  it('asks once per host and remembers the answer', async () => {
    const allowHost = vi.fn((h: string) => Promise.resolve(h !== 'no.test'));
    const { p, log, fetch } = proxy({ allowHost });
    await Promise.all([
      p.handle({ method: 'GET', url: 'https://yes.test/a' }),
      p.handle({ method: 'GET', url: 'https://yes.test/b' }),
    ]);
    expect(await p.handle({ method: 'GET', url: 'https://no.test/' })).toEqual({
      status: 0,
      body: '',
    });
    await p.handle({ method: 'GET', url: 'https://no.test/' });
    expect(allowHost.mock.calls.map((c) => c[0])).toEqual(['yes.test', 'no.test']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(log[0]).toMatch(/no.test isn't allowed/);
    expect(p.allowedHosts).toEqual(['yes.test']);
    p.reset(['other.test']);
    expect(p.allowedHosts).toEqual(['other.test']);
  });

  it('refuses non-http URLs and misplaced secrets without fetching', async () => {
    const { p, log, fetch } = proxy();
    await p.handle({ method: 'GET', url: 'file:///etc/passwd' });
    await p.handle({ method: 'GET', url: 'https://evil.test/?k={{WEATHER_KEY}}' });
    expect(fetch).not.toHaveBeenCalled();
    expect(log).toHaveLength(2);
  });

  it('scrubs secrets from replies and caps their size', async () => {
    const echo = vi.fn<typeof globalThis.fetch>(() => ok('token sk-secret-value'));
    const { p } = proxy({ fetch: echo });
    expect((await p.handle({ method: 'GET', url: 'https://api.ai.test/' })).body).toBe('token •••');
    const big = proxy({ fetch: () => ok('x'.repeat(50)), maxBytes: 10 });
    expect(await big.p.handle({ method: 'GET', url: 'https://big.test/' })).toEqual({
      status: 0,
      body: '',
    });
    expect(big.log[0]).toMatch(/over 10 bytes/);
  });

  it('reports network errors as status 0', async () => {
    const { p, log } = proxy({ fetch: () => Promise.reject(new TypeError('Failed to fetch')) });
    expect(await p.handle({ method: 'GET', url: 'https://down.test/' })).toEqual({
      status: 0,
      body: '',
    });
    expect(log[0]).toMatch(/Failed to fetch.*cross-origin/);
  });

  it('limits requests in flight', async () => {
    let open = 0;
    let peak = 0;
    const slow = () => {
      open++;
      peak = Math.max(peak, open);
      return new Promise<Response>((r) =>
        setTimeout(() => {
          open--;
          r(new Response('ok'));
        }, 5),
      );
    };
    const { p } = proxy({ fetch: slow, maxInFlight: 2 });
    await Promise.all(
      Array.from({ length: 6 }, (_, i) => p.handle({ method: 'GET', url: `https://q.test/${i}` })),
    );
    expect(peak).toBe(2);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { FetchNet, hide } from './fetch-net';

describe('FetchNet without a prepare step (exported players)', () => {
  it('sends the request as written, with no added headers, cookies or secrets', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(new Response('{"ok":1}')));
    const net = new FetchNet({ allowHost: () => Promise.resolve(true), log: () => {}, fetch });
    expect(await net.request({ method: 'POST', url: 'https://api.test/x', body: 'hi' })).toEqual({
      status: 200,
      body: '{"ok":1}',
    });
    expect(fetch.mock.calls[0]![1]).toMatchObject({
      method: 'POST',
      body: 'hi',
      credentials: 'omit',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    });
  });

  it('asks once per host, and a refused host never reaches fetch', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(new Response('')));
    const allowHost = vi.fn(() => Promise.resolve(false));
    const log: string[] = [];
    const net = new FetchNet({ allowHost, log: (t) => log.push(t), fetch });
    await net.request({ method: 'GET', url: 'https://a.test/1' });
    await net.request({ method: 'GET', url: 'https://a.test/2' });
    expect(allowHost).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(log).toEqual([
      "HTTP: a.test isn't allowed for this cart",
      "HTTP: a.test isn't allowed for this cart",
    ]);
  });
});

describe('hide', () => {
  it('replaces raw and URL-encoded values, but not very short ones', () => {
    expect(hide('a k/y+1 b k%2Fy%2B1 c ab', ['k/y+1', 'ab'])).toBe('a ••• b ••• c ab');
  });
});

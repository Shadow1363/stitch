import { normalizeCart } from '@stitch/cart';
import { IR_VERSION } from '@stitch/ir';
import { strFromU8, unzipSync } from 'fflate';
import { contrast, over } from '@stitch/blocks/color';
import { describe, expect, it } from 'vitest';
import {
  crateName,
  exportHtml,
  gameFromCart,
  GAME_FORMAT,
  hash,
  jsonForScript,
  originsIn,
  playerCsp,
  pngToIco,
  pwaFiles,
  scriptText,
  tauriFiles,
  zipFiles,
} from './index';
import { PLAYER_TOKENS as T } from './player/shell';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function cart(over: Record<string, unknown> = {}) {
  return normalizeCart({
    format: 'stitch-cart',
    version: 4,
    meta: { title: 'Space </script> Race', author: 'Ada' },
    project: { irVersion: IR_VERSION, stage: { items: [] }, sprites: [] },
    sprites: [],
    assets: {},
    extensions: [],
    editor: { files: { player: { layout: { a: { x: 1, y: 2 } }, loose: [] } } },
    ...over,
  });
}

const CODE = 'rt.log("hi"); const u = "https://api.example.com/scores?x=1";';
const game = () => gameFromCart(cart(), CODE);

/** The text of every `<script>` element, split the way an HTML parser would. */
function scripts(html: string): string[] {
  return [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script/gi)].map((m) => m[1]!);
}

describe('exported game', () => {
  it('keeps what runs and drops the IR and editor state', () => {
    const g = game();
    expect(g.format).toBe(GAME_FORMAT);
    expect(g.code).toBe(CODE);
    expect(g.title).toBe('Space </script> Race');
    expect(g).not.toHaveProperty('project');
    expect(g).not.toHaveProperty('editor');
    expect(JSON.stringify(g)).not.toContain('layout');
  });

  it('finds the origins its code names', () => {
    const g = gameFromCart(
      cart({
        extensions: [
          {
            manifest: {
              id: 'w',
              name: 'W',
              version: '1',
              color: '#112233',
              blocks: [{ name: 'w_get', kind: 'reporter', label: 'get', params: [] }],
            },
            code: 'stitch.http("GET", "http://LOCALHOST:8080/x")',
          },
        ],
      }),
      CODE + ' "https://api.example.com/other"',
    );
    expect(originsIn(g)).toEqual(['http://localhost:8080', 'https://api.example.com']);
  });
});

describe('single-file HTML', () => {
  it("can't be broken out of by game text or player code", () => {
    const player = 'var s = "</script><script>alert(1)</script>"; var c = "<!--";';
    const html = exportHtml(game(), player);
    const [data, js] = scripts(html);
    expect(scripts(html)).toHaveLength(2);
    expect(JSON.parse(data!)).toEqual(game());
    expect(js).toBe(scriptText(player));
    // The escaped script means the same thing.
    expect(new Function(`${js}; return [s, c];`)()).toEqual([
      '</script><script>alert(1)</script>',
      '<!--',
    ]);
    expect(html).toContain('<title>Space &lt;/script&gt; Race</title>');
  });

  it('escapes regexes the same way, even with the u flag', () => {
    const js = scriptText('return [/<\\/script>/u.test("</script>"), /<!--/u.test("<!--")];');
    expect(new Function(js)()).toEqual([true, true]);
  });

  it('keeps the stage CSP but lets players fetch directly', () => {
    const csp = playerCsp('html');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain('connect-src data: http: https:');
    expect(csp).not.toContain('ipc:');
    expect(playerCsp('tauri')).toContain('ipc: http://ipc.localhost');
    expect(playerCsp('pwa')).toContain("worker-src 'self' blob:");
    expect(exportHtml(game(), '')).toContain(`content="${playerCsp('html')}"`);
  });

  it('round-trips JSON with every awkward character', () => {
    const v = { s: '</script> <!-- & " \' \\' };
    expect(jsonForScript(v)).not.toContain('<');
    expect(JSON.parse(jsonForScript(v))).toEqual(v);
  });
});

describe('PWA', () => {
  const files = () => pwaFiles(game(), 'void 0', { 192: PNG, 512: PNG });

  it('has a page, manifest, icons and a service worker that caches them all', () => {
    const f = files();
    expect(Object.keys(f).sort()).toEqual([
      'icon-192.png',
      'icon-512.png',
      'index.html',
      'manifest.webmanifest',
      'sw.js',
    ]);
    const manifest = JSON.parse(f['manifest.webmanifest'] as string);
    expect(manifest).toMatchObject({
      name: 'Space </script> Race',
      start_url: './',
      display: 'fullscreen',
    });
    expect(manifest.icons.map((i: { src: string }) => i.src)).toEqual([
      'icon-192.png',
      'icon-512.png',
    ]);
    const html = f['index.html'] as string;
    expect(html).toContain('<link rel="manifest" href="manifest.webmanifest" />');
    expect(html).toContain("navigator.serviceWorker.register('./sw.js')");
    const sw = f['sw.js'] as string;
    for (const name of ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'])
      expect(sw).toContain(JSON.stringify(name));
    expect(() => new Function(sw)).not.toThrow();
  });

  it('names its cache after the content, so a new export replaces the old one', () => {
    const a = files()['sw.js'] as string;
    const b = pwaFiles(gameFromCart(cart(), CODE + ';'), 'void 0', { 192: PNG, 512: PNG })['sw.js'];
    expect(a).toContain('"stitch-space-script-race-"');
    expect(a).not.toBe(b);
    expect(hash('a')).not.toBe(hash('b'));
  });
});

describe('Tauri project', () => {
  it('has the HTTP plugin, an allow-list from the code and the page with IPC allowed', () => {
    const f = tauriFiles(game(), 'void 0', { 256: PNG, 512: PNG });
    expect(f['src-tauri/Cargo.toml']).toContain('name = "space-script-race"');
    expect(f['src-tauri/Cargo.toml']).toContain('tauri-plugin-http = "2"');
    expect(f['src-tauri/src/main.rs']).toContain('.plugin(tauri_plugin_http::init())');
    const conf = JSON.parse(f['src-tauri/tauri.conf.json'] as string);
    expect(conf.build.frontendDist).toBe('../www');
    expect(conf.app.withGlobalTauri).toBe(true);
    expect(conf.app.windows[0]).toMatchObject({ label: 'main', width: 960, height: 720 });
    expect(conf.productName).toBe('Space script Race');
    const cap = JSON.parse(f['src-tauri/capabilities/default.json'] as string);
    expect(cap.windows).toEqual(['main']);
    expect(cap.permissions[1]).toEqual({
      identifier: 'http:default',
      allow: [{ url: 'https://api.example.com/*' }],
    });
    expect(f['www/index.html']).toContain(playerCsp('tauri'));
    expect(f['README.md']).toContain('`https://api.example.com/*`');
  });

  it('makes valid crate names and ICO files', () => {
    expect(crateName('8-bit Hero!')).toBe('stitch-8-bit-hero');
    expect(crateName('')).toBe('game');
    const ico = pngToIco(PNG, 256);
    const v = new DataView(ico.buffer);
    expect([v.getUint16(0, true), v.getUint16(2, true), v.getUint16(4, true)]).toEqual([0, 1, 1]);
    expect([ico[6], ico[7]]).toEqual([0, 0]);
    expect(v.getUint32(14, true)).toBe(PNG.length);
    expect(ico.slice(v.getUint32(18, true))).toEqual(PNG);
  });
});

describe('zip', () => {
  it('puts every file under one folder', () => {
    const z = unzipSync(zipFiles({ 'a.txt': 'hello', 'b/c.png': PNG }, 'game'));
    expect(Object.keys(z).sort()).toEqual(['game/a.txt', 'game/b/c.png']);
    expect(strFromU8(z['game/a.txt']!)).toBe('hello');
    expect(z['game/b/c.png']).toEqual(PNG);
  });
});

describe('player shell', () => {
  it('meets WCAG AA with its token copy', () => {
    const card = T.card;
    const dimmed = over(T.overlay, T.bg);
    for (const [fg, bg] of [
      [T.text, card],
      [T.muted, card],
      [T.onAccent, T.accent],
      [T.text, T.quiet],
      [T.onBad, T.bad],
      [T.text, dimmed],
    ] as const)
      expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(T.focus, card)).toBeGreaterThanOrEqual(3);
  });
});

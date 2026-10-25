/**
 * Entry point inside the sandboxed stage iframe (sandbox="allow-scripts", opaque origin).
 * Talks to the editor only through postMessage; see protocol.ts. Running itself is the
 * StageRunner, shared with exported players.
 */
import { PROTOCOL_VERSION, type FromStage, type ToStage } from './protocol';
import type { RendererPreference } from './pixi/stage';
import { StageRunner } from './runner';
import { BridgeNet } from './web/net';

export async function startHost(container: HTMLElement = document.body): Promise<void> {
  const post = (m: FromStage) => parent.postMessage(m, '*');
  const pref =
    (new URLSearchParams(location.search).get('renderer') as RendererPreference | null) ?? 'webgl';
  const net = new BridgeNet(post);
  const runner = await StageRunner.create({
    container,
    preference: pref,
    net,
    onReset: () => net.reset(),
    onLog: (sprite, text) => post({ t: 'log', sprite, text }),
    onError: (e) => post({ t: 'error', ...e }),
  });

  setInterval(
    () =>
      post({
        t: 'stats',
        ...runner.stats.take(),
        threads: runner.threads,
        started: runner.started,
        audio: runner.audio.state,
      }),
    250,
  );

  addEventListener('message', (e: MessageEvent<ToStage>) => {
    if (e.source !== parent) return;
    const m = e.data;
    switch (m.t) {
      case 'load':
        if (m.v !== PROTOCOL_VERSION) return;
        if (runner.load(m)) post({ t: 'loaded' });
        return;
      case 'run':
        // Works when the editor delegated autoplay (allow="autoplay") after its own click.
        runner.run();
        return;
      case 'stop':
        runner.stop();
        return;
      case 'pause':
        runner.setPaused(m.paused);
        return;
      case 'ping':
        post({ t: 'pong', n: m.n });
        return;
      case 'http-result':
        net.answer(m);
        return;
      case 'loudness':
        runner.setLoudness(m.level);
        return;
    }
  });

  post({ t: 'ready', v: PROTOCOL_VERSION, renderer: runner.renderer.name });
}

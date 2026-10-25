/**
 * Entry of the exported player bundle (one classic script, inlined into the page). Reads the
 * game from `<script id="stitch-game">`, renders its sources and runs it with the same
 * StageRunner as the editor's stage. There's no editor here, so HTTP is fetched directly:
 * asked once per host, with limits, and never with secrets.
 */
import { FetchNet } from '@stitch/runtime/fetch-net';
import { Microphone, streamLevel, usesLoudness } from '@stitch/runtime/mic';
import { StageRunner } from '@stitch/runtime/runner';
import { GAME_FORMAT, GAME_VERSION, type ExportedGame } from '../game';
import { gamePayload } from '../payload';
import { askHost, installStyles, message, restartButton, showError, startScreen } from './shell';

/** The desktop build's native fetch (Tauri HTTP plugin), which isn't bound by CORS. */
function nativeFetch(): typeof fetch | undefined {
  const tauri = (globalThis as { __TAURI__?: { http?: { fetch?: typeof fetch } } }).__TAURI__;
  return tauri?.http?.fetch;
}

async function main(): Promise<void> {
  installStyles();
  const game = JSON.parse(
    document.getElementById('stitch-game')?.textContent ?? 'null',
  ) as ExportedGame | null;
  if (game?.format !== GAME_FORMAT || game.v !== GAME_VERSION) {
    message('This page holds no Stitch game this player can run.');
    return;
  }
  document.title = game.title;
  const loading = message('Loading…');
  const nf = nativeFetch();
  const net = new FetchNet({
    allowHost: askHost,
    log: (text) => console.warn(text),
    ...(nf ? { fetch: nf } : {}),
  });
  const runner = await StageRunner.create({
    container: document.getElementById('stage')!,
    net,
    onLog: (sprite, text) => console.log(`[${sprite}] ${text}`),
    onError: (e) => {
      const text = `${e.sprite} (${e.event}): ${e.message}`;
      console.error(text);
      showError(text);
    },
  });
  const ok = runner.load(await gamePayload(game));
  loading.remove();
  if (!ok) return;
  await startScreen(game.title, game.author);
  // Only a game that reads the loudness asks for the microphone, after the player's click (D34).
  if (usesLoudness(game.code))
    void Microphone.open().then((mic) => mic && streamLevel(mic, (l) => runner.setLoudness(l)));
  runner.run();
  restartButton(() => runner.run());
}

main().catch((e: unknown) => {
  console.error(e);
  showError(`The game couldn't start: ${e instanceof Error ? e.message : String(e)}`);
});

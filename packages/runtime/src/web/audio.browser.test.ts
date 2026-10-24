import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { WebAudioOut } from './audio';

const outs: WebAudioOut[] = [];
afterEach(async () => {
  for (const o of outs.splice(0)) await o.ctx.close();
  document.body.innerHTML = '';
});

const clip = (id: string, seconds: number) => ({
  id,
  name: id,
  rate: 44100,
  samples: new Float32Array(Math.round(44100 * seconds)).map((_, i) => Math.sin(i / 10) * 0.1),
});

describe('WebAudioOut', () => {
  it('starts the AudioContext from a user gesture', async () => {
    const out = new WebAudioOut();
    outs.push(out);
    // Whether a fresh context starts suspended depends on the browser's autoplay policy;
    // after a gesture that calls unlock() it must be running either way.
    const button = document.createElement('button');
    button.textContent = 'run';
    button.onclick = () => out.unlock();
    document.body.append(button);
    await userEvent.click(button);
    await expect.poll(() => out.state).toBe('running');
  });

  it('plays, overlaps and stops sounds and music', async () => {
    const out = new WebAudioOut();
    outs.push(out);
    out.unlock();
    out.setClips([clip('a', 0.2)], [{ ...clip('m', 1), loop: true }]);
    out.playSound('a');
    out.playSound('a');
    out.playSound('missing');
    out.playMusic('m');
    out.setVolume(0.5);
    expect(() => {
      out.stopSounds();
      out.stopMusic();
      out.stopMusic();
    }).not.toThrow();
  });
});

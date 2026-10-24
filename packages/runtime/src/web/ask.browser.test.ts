import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { ASK_CLASS, DomAsk, fromAskField } from './ask';

afterEach(() => {
  document.body.innerHTML = '';
});

// Inside the test page's small viewport, so every part can be clicked.
const stage = { left: 10, top: 20, width: 380, height: 280 };
const field = () => document.querySelector<HTMLElement>(`.${ASK_CLASS}`)!;

describe('DomAsk', () => {
  it('opens over the bottom of the stage and answers on Enter', async () => {
    let closed = 0;
    const ask = new DomAsk(
      () => stage,
      () => closed++,
    );
    const answer = ask.ask('Your name?');
    expect(ask.open).toBe(true);
    const r = field().getBoundingClientRect();
    expect(r.left).toBeGreaterThanOrEqual(stage.left);
    expect(r.right).toBeLessThanOrEqual(stage.left + stage.width);
    expect(r.bottom).toBeLessThanOrEqual(stage.top + stage.height);
    expect(r.bottom).toBeGreaterThan(stage.top + stage.height - 20);
    expect(field().textContent).toContain('Your name?');
    expect(document.activeElement).toBe(field().querySelector('input'));
    await userEvent.keyboard('Ada{Enter}');
    expect(await answer).toBe('Ada');
    expect(ask.open).toBe(false);
    expect(closed).toBe(1);
  });

  it('hides the prompt line when a speech bubble shows the question', () => {
    const ask = new DomAsk(() => stage);
    void ask.ask('');
    expect(field().querySelector('div')!.hidden).toBe(true);
  });

  it('answers with the ✓ button too', async () => {
    const ask = new DomAsk(() => stage);
    const answer = ask.ask('?');
    await userEvent.type(field().querySelector('input')!, '42');
    await userEvent.click(field().querySelector('button')!);
    expect(await answer).toBe('42');
  });

  it('cancel closes the field without answering', async () => {
    const ask = new DomAsk(() => stage);
    let answered = false;
    void ask.ask('?').then(() => (answered = true));
    ask.cancel();
    expect(ask.open).toBe(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(answered).toBe(false);
  });

  it('marks its events, so the runner keeps them from key and click hats', () => {
    new DomAsk(() => stage);
    expect(fromAskField(field().querySelector('input'))).toBe(true);
    expect(fromAskField(document.body)).toBe(false);
  });
});

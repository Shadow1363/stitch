import type { AskOut } from '../core/ask';

/** Where the stage is drawn, in viewport pixels (the canvas minus its letterbox). */
export interface StageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The answer field's colours: the speech bubble's, because the field is part of the game
 * picture and looks the same in the editor, the stage and every exported player (D32).
 */
export const ASK_COLOURS = { fill: '#ffffff', text: '#222222', line: '#999999', button: '#1f5be1' };

/** Marks the field, so the runner can keep its keys and clicks away from the game. */
export const ASK_CLASS = 'stitch-ask';

/** True for events from inside the answer field. */
export const fromAskField = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(`.${ASK_CLASS}`) !== null;

/**
 * `ask`'s answer field: a bar over the bottom of the stage with the question (when no speech
 * bubble shows it), a text input and a ✓ button. Enter or ✓ answers.
 */
export class DomAsk implements AskOut {
  // Not a <form>: the stage's sandbox has no allow-forms, which blocks submitting one.
  private form = document.createElement('div');
  private prompt = document.createElement('div');
  private input = document.createElement('input');
  private resolve: ((answer: string) => void) | undefined;

  constructor(
    private stageRect: () => StageRect,
    /** Called after an answer, e.g. to give keyboard focus back to the stage. */
    private onClose: () => void = () => {},
  ) {
    const c = ASK_COLOURS;
    const { form, prompt, input } = this;
    form.className = ASK_CLASS;
    form.hidden = true;
    Object.assign(form.style, {
      position: 'fixed',
      boxSizing: 'border-box',
      padding: '6px 8px',
      background: c.fill,
      color: c.text,
      border: `1.5px solid ${c.line}`,
      borderRadius: '8px',
      font: '14px system-ui, sans-serif',
      zIndex: '10',
    });
    prompt.style.margin = '0 0 4px';
    Object.assign(input.style, {
      boxSizing: 'border-box',
      width: 'calc(100% - 36px)',
      font: 'inherit',
      padding: '3px 6px',
      border: `1px solid ${c.line}`,
      borderRadius: '6px',
      color: c.text,
      background: c.fill,
    });
    input.setAttribute('aria-label', 'Answer');
    input.autocomplete = 'off';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = '✓';
    ok.setAttribute('aria-label', 'Answer');
    Object.assign(ok.style, {
      width: '26px',
      height: '26px',
      marginLeft: '8px',
      padding: '0',
      verticalAlign: 'middle',
      border: 'none',
      borderRadius: '50%',
      background: c.button,
      color: c.fill,
      font: 'inherit',
      cursor: 'pointer',
    });
    form.append(prompt, input, ok);
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      this.answer();
    });
    ok.addEventListener('click', () => this.answer());
    addEventListener('resize', () => this.place());
    document.body.append(form);
  }

  ask(question: string): Promise<string> {
    this.prompt.textContent = question;
    this.prompt.hidden = question === '';
    this.input.value = '';
    this.form.hidden = false;
    this.place();
    this.input.focus();
    return new Promise((resolve) => (this.resolve = resolve));
  }

  cancel(): void {
    this.close();
  }

  private answer(): void {
    const done = this.resolve;
    if (!done) return;
    this.close();
    done(this.input.value);
    this.onClose();
  }

  /** The field is open (for tests and the runner). */
  get open(): boolean {
    return !this.form.hidden;
  }

  private close(): void {
    this.resolve = undefined;
    this.form.hidden = true;
  }

  /** Sits along the bottom of the stage with a small margin, at the stage's current size. */
  private place(): void {
    if (this.form.hidden) return;
    const r = this.stageRect();
    const pad = Math.max(4, Math.round(r.width * 0.02));
    Object.assign(this.form.style, {
      left: `${r.left + pad}px`,
      width: `${Math.max(120, r.width - 2 * pad)}px`,
      bottom: `${innerHeight - (r.top + r.height) + pad}px`,
    });
  }
}

/**
 * Where `ask` questions go. The stage and exported players show a text field over the stage
 * (web/ask.ts); tests use NullAsk. Questions arrive one at a time: the world queues them.
 */
export interface AskOut {
  /**
   * Shows the answer field, with `prompt` above it (empty when a sprite's speech bubble already
   * shows the question), and resolves with what the player typed.
   */
  ask(prompt: string): Promise<string>;
  /** Closes the field. A pending answer never arrives. */
  cancel(): void;
}

/** Answers from a list, in order (then with ""), and records each prompt. */
export class NullAsk implements AskOut {
  readonly prompts: string[] = [];
  cancelled = 0;
  constructor(private answers: string[] = []) {}

  ask(prompt: string): Promise<string> {
    this.prompts.push(prompt);
    return Promise.resolve(this.answers.shift() ?? '');
  }

  cancel(): void {
    this.cancelled++;
  }
}

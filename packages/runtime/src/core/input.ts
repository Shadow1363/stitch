const NAMED: Record<string, string> = {
  arrowleft: 'left',
  arrowright: 'right',
  arrowup: 'up',
  arrowdown: 'down',
  ' ': 'space',
  spacebar: 'space',
  esc: 'escape',
};

/** Maps a DOM KeyboardEvent.key, or a name written in a script, to a Stitch key name. */
export function normalizeKey(key: string): string {
  const k = key.toLowerCase();
  return NAMED[k] ?? k;
}

/** Keyboard state. Presses are queued and turned into key hats at the start of a tick. */
export class Input {
  private down = new Set<string>();
  private pressed: string[] = [];

  keyDown(key: string): void {
    const k = normalizeKey(key);
    if (!this.down.has(k)) this.pressed.push(k);
    this.down.add(k);
  }

  keyUp(key: string): void {
    this.down.delete(normalizeKey(key));
  }

  /** On blur, keys can be released without a keyup event. */
  releaseAll(): void {
    this.down.clear();
  }

  isDown(key: string): boolean {
    const k = normalizeKey(key);
    return k === 'any' ? this.down.size > 0 : this.down.has(k);
  }

  takePressed(): string[] {
    const p = this.pressed;
    this.pressed = [];
    return p;
  }
}

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

/** Keyboard and pointer state. Presses are queued and turned into hats at the start of a tick. */
export class Input {
  private down = new Set<string>();
  private pressed: string[] = [];
  /** Keys that went down since the previous tick, for `key_pressed`. */
  private justPressed = new Set<string>();
  /** Pointer position in cart coordinates. */
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  private clicks: { x: number; y: number }[] = [];

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
    this.mouseDown = false;
  }

  /** Pointer moved, in cart coordinates. */
  pointerMove(x: number, y: number): void {
    this.mouseX = x;
    this.mouseY = y;
  }

  pointerDown(x: number, y: number): void {
    this.pointerMove(x, y);
    this.mouseDown = true;
    this.clicks.push({ x, y });
  }

  pointerUp(): void {
    this.mouseDown = false;
  }

  /** True on the tick a key went down (`"any"`: any key). */
  wasPressed(key: string): boolean {
    const k = normalizeKey(key);
    return k === 'any' ? this.justPressed.size > 0 : this.justPressed.has(k);
  }

  takeClicks(): { x: number; y: number }[] {
    const c = this.clicks;
    this.clicks = [];
    return c;
  }

  isDown(key: string): boolean {
    const k = normalizeKey(key);
    return k === 'any' ? this.down.size > 0 : this.down.has(k);
  }

  /** Presses since the last tick. Also what `wasPressed` reports until the next call. */
  takePressed(): string[] {
    const p = this.pressed;
    this.pressed = [];
    this.justPressed = new Set(p);
    return p;
  }
}

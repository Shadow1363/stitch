/** Editor-side client for the sandboxed stage iframe. */
import {
  PROTOCOL_VERSION,
  transferablesOf,
  type FromStage,
  type HttpResponse,
  type LoadPayload,
  type ToStage,
} from './protocol';

export interface StageClientOptions {
  /** URL of the stage page (e.g. "/stage.html"). */
  src: string;
  onMessage: (m: FromStage) => void;
  /** Called when the stage stops answering pings and is being recreated. A new `ready` follows. */
  onRestart?: () => void;
  /** Milliseconds without a pong before the iframe is replaced. */
  watchdogMs?: number;
}

export class StageClient {
  private iframe!: HTMLIFrameElement;
  private ready = false;
  private queue: ToStage[] = [];
  private ping = 0;
  private lastPong = performance.now();
  private timer: ReturnType<typeof setInterval>;
  private readonly onWindowMessage = (e: MessageEvent<FromStage>) => this.receive(e);

  constructor(
    private host: HTMLElement,
    private opts: StageClientOptions,
  ) {
    addEventListener('message', this.onWindowMessage);
    this.mount();
    const limit = opts.watchdogMs ?? 3000;
    this.timer = setInterval(() => {
      if (!this.ready) return;
      if (performance.now() - this.lastPong > limit) {
        this.opts.onRestart?.();
        this.mount();
        return;
      }
      this.post({ t: 'ping', n: ++this.ping });
    }, 1000);
  }

  private mount() {
    this.iframe?.remove();
    this.ready = false;
    const f = document.createElement('iframe');
    // allow-scripts only: opaque origin, no access to editor storage, cookies or secrets.
    f.setAttribute('sandbox', 'allow-scripts');
    // Lets the stage start audio on the editor's Run click; it grants nothing else.
    f.setAttribute('allow', 'autoplay');
    f.src = this.opts.src;
    f.title = 'Stage';
    f.style.cssText = 'border:0;width:100%;height:100%;display:block';
    this.host.appendChild(f);
    this.iframe = f;
  }

  private receive(e: MessageEvent<FromStage>) {
    if (e.source !== this.iframe.contentWindow) return;
    const m = e.data;
    if (m.t === 'ready') {
      if (m.v !== PROTOCOL_VERSION) return;
      this.ready = true;
      this.lastPong = performance.now();
      const pending = this.queue;
      this.queue = [];
      for (const p of pending) this.post(p);
    }
    if (m.t === 'pong') this.lastPong = performance.now();
    this.opts.onMessage(m);
  }

  private post(m: ToStage) {
    if (!this.ready || !this.iframe.contentWindow) {
      if (m.t !== 'ping') this.queue.push(m);
      return;
    }
    this.iframe.contentWindow.postMessage(m, '*', transferablesOf(m));
  }

  /**
   * Bitmaps in `payload.costumes` are transferred and unusable afterwards, so callers decode
   * fresh ones per load (including after every `ready`, which follows a watchdog restart).
   */
  load(payload: LoadPayload) {
    this.post({ t: 'load', v: PROTOCOL_VERSION, ...payload });
  }

  run() {
    this.post({ t: 'run' });
    this.iframe.focus();
  }

  stop() {
    this.post({ t: 'stop' });
  }

  pause(paused: boolean) {
    this.post({ t: 'pause', paused });
    if (!paused) this.iframe.focus();
  }

  /** Answers the stage's `http` request `id`. */
  httpResult(id: number, res: HttpResponse) {
    this.post({ t: 'http-result', id, ...res });
  }

  focus() {
    this.iframe.focus();
  }

  destroy() {
    clearInterval(this.timer);
    removeEventListener('message', this.onWindowMessage);
    this.iframe.remove();
  }
}

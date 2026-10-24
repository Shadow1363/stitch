import type { HttpRequest, HttpResponse, NetOut } from '../core/net';
import type { FromStage, ToStage } from '../protocol';

/**
 * NetOut inside the sandbox: requests go to the editor as `http` messages, which fetches them
 * (the stage has an opaque origin and no secrets) and answers with `http-result`.
 */
export class BridgeNet implements NetOut {
  private nextId = 1;
  private pending = new Map<number, (r: HttpResponse) => void>();

  constructor(private post: (m: FromStage) => void) {}

  request(req: HttpRequest): Promise<HttpResponse> {
    const id = this.nextId++;
    this.post({ t: 'http', id, ...req });
    return new Promise((resolve) => this.pending.set(id, resolve));
  }

  answer(m: Extract<ToStage, { t: 'http-result' }>): void {
    const resolve = this.pending.get(m.id);
    if (!resolve) return; // from a previous run
    this.pending.delete(m.id);
    resolve({ status: m.status, body: m.body });
  }

  /** Forgets outstanding requests when a new world starts; their threads are gone. */
  reset(): void {
    this.pending.clear();
  }
}

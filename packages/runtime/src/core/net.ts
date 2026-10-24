export interface HttpRequest {
  method: 'GET' | 'POST';
  url: string;
  body?: string;
}

/** `status` 0 means the request never got an HTTP answer (blocked, offline, timed out). */
export interface HttpResponse {
  status: number;
  body: string;
}

/**
 * Where HTTP requests go. The stage forwards them to the editor over the bridge (web/net.ts),
 * which fetches them with secrets added; tests use NullNet or a fake.
 */
export interface NetOut {
  request(req: HttpRequest): Promise<HttpResponse>;
}

/** Answers every request with status 0 and records it, for tests and for running offline. */
export class NullNet implements NetOut {
  readonly requests: HttpRequest[] = [];
  request(req: HttpRequest): Promise<HttpResponse> {
    this.requests.push(req);
    return Promise.resolve({ status: 0, body: '' });
  }
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Waits for a promise inside a green thread: yields once per tick until it settles, then
 * returns its value (or throws its error). A promise always settles between ticks, so this
 * takes at least one tick and the thread resumes at its normal place in the tick order.
 */
export function* settle<T>(p: PromiseLike<T>): Generator<undefined, T, unknown> {
  // A box, so control-flow narrowing doesn't treat the callback-set result as always unset.
  const box: { s?: Settled<T> } = {};
  p.then(
    (value) => (box.s = { ok: true, value }),
    (error: unknown) => (box.s = { ok: false, error }),
  );
  while (!box.s) yield;
  if (!box.s.ok) throw box.s.error;
  return box.s.value;
}

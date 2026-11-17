/**
 * One HTTP exchange, as this repository makes them.
 *
 * There is one transport and every caller goes through it. A plugin that
 * reached for `fetch` itself was the defect: Slack and Linear waited forever
 * on a server that never answered, and nothing in either file said how long
 * a call was allowed to take.
 */

/** One HTTP exchange, small enough to script in a test. */
export interface HttpRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  /** Refuse the answer once its body passes this many bytes, while it arrives. */
  maxBytes?: number;
  /**
   * How long the whole exchange may take, body included. Left out, the
   * transport's own ceiling applies, so no request waits forever.
   */
  deadlineMs?: number;
}

export interface HttpResponse {
  status: number;
  /** Lower-cased names, when the transport keeps them. */
  headers?: Record<string, string>;
  body: Uint8Array;
}

export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;

/** How long one exchange may take when a caller names no deadline of its own. */
export const DEFAULT_HTTP_DEADLINE_MS = 30_000;

/** An answer larger than the request allowed, refused before it was held whole. */
export class TooLarge extends Error {
  constructor(readonly limit: number) {
    super(`the answer is larger than ${limit} bytes`);
  }
}

/**
 * A call that ran out of the time it allowed itself.
 *
 * Typed so a loop can tell a server that stopped answering from a defect of
 * its own: the first is a pass to repeat, the second is not.
 */
export class DeadlineExceeded extends Error {
  constructor(
    readonly host: string,
    readonly deadlineMs: number,
  ) {
    super(`${host} did not answer within ${deadlineMs} ms`);
  }
}

/** Whether an error is a call that ran out of time, wrapped or not. */
export function isDeadlineExceeded(error: unknown): boolean {
  if (error instanceof DeadlineExceeded) return true;
  return error instanceof Error && / did not answer within \d+ ms$/.test(error.message);
}

export const fetchTransport: HttpTransport = async (request) => {
  const deadlineMs = request.deadlineMs ?? DEFAULT_HTTP_DEADLINE_MS;
  // One signal for the request and the body, so a server that trickles bytes
  // forever is cut off too.
  const signal = AbortSignal.timeout(deadlineMs);
  try {
    const response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body, signal });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });
    return { status: response.status, headers, body: await readBody(response, request.maxBytes) };
  } catch (error) {
    // Named by host and deadline rather than by the abort's own name: the
    // caller has to be able to say what it waited for and for how long.
    if (signal.aborted) throw new DeadlineExceeded(hostOf(request.url), deadlineMs);
    throw error;
  }
};

/**
 * The body, counted as it arrives: a declared length over the limit is
 * refused unread, and a missing or understated one is caught by the count.
 */
async function readBody(response: Response, maxBytes: number | undefined): Promise<Uint8Array> {
  if (maxBytes === undefined || !response.body) return new Uint8Array(await response.arrayBuffer());
  if (Number(response.headers.get("content-length") ?? 0) > maxBytes) {
    await response.body.cancel();
    throw new TooLarge(maxBytes);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new TooLarge(maxBytes);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** The host a request was for, said without its path or its credentials. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

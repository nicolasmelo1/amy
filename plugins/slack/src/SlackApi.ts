import { TooLarge, fetchTransport } from "@amykit/core";
import type { HttpRequest, HttpResponse, HttpTransport } from "@amykit/core";

// The one transport, named here too: a caller that already imported it from
// this plugin keeps working, and no second copy of it exists to drift.
export { TooLarge, fetchTransport };
export type { HttpRequest, HttpResponse, HttpTransport };

export const SLACK_API = "https://slack.com/api";

/** What one Web API method answered, with the headers that carry the scopes. */
export interface SlackAnswer {
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

export interface SlackApiOptions {
  transport?: HttpTransport;
  sleep?: (ms: number) => Promise<void>;
  /** How many times a `429` is waited out before the call fails. */
  maxRateLimitRetries?: number;
  /** How long a `429` that names no `Retry-After` is waited out. */
  defaultRetryAfterSeconds?: number;
  /** How long one exchange may take, body included. */
  deadlineMs?: number;
}

/**
 * Slack's answer when it waits without saying for how long: the one-a-minute
 * limit on `conversations.replies` is the one this plugin is likeliest to hit.
 */
export const DEFAULT_RETRY_AFTER_S = 60;

export const DEFAULT_RATE_LIMIT_RETRIES = 5;

/**
 * How long one call may take, its waits included.
 *
 * Longer than the one-a-minute rhythm Slack's `429` imposes: a call allowed
 * less than that would refuse to obey the server it is talking to. Bounded
 * all the same, so a `Retry-After` of a day is not five days of waiting.
 */
const DEFAULT_SLACK_DEADLINE_MS = 120_000;

/**
 * The Web API, and only the Web API.
 *
 * No Socket Mode: Slack hands each event to one of an app's connections, so
 * a connection opened here would take events from whatever else is connected.
 */
export class SlackApi {
  private readonly transport: HttpTransport;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly defaultRetryAfterS: number;
  private readonly deadlineMs: number;

  constructor(
    private readonly token: string,
    options: SlackApiOptions = {},
  ) {
    this.transport = options.transport ?? fetchTransport;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxRetries = options.maxRateLimitRetries ?? DEFAULT_RATE_LIMIT_RETRIES;
    this.defaultRetryAfterS = options.defaultRetryAfterSeconds ?? DEFAULT_RETRY_AFTER_S;
    this.deadlineMs = options.deadlineMs ?? DEFAULT_SLACK_DEADLINE_MS;
  }

  /** Calls a method form-encoded, which every method accepts, and refuses `ok: false`. */
  async call(method: string, args: Record<string, string | undefined> = {}): Promise<SlackAnswer> {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(args)) if (value !== undefined) form.set(key, value);

    const response = await this.send({
      url: `${SLACK_API}/${method}`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      deadlineMs: this.deadlineMs,
    });
    if (response.status !== 200) throw new Error(`slack ${method} answered HTTP ${response.status}`);

    const body = JSON.parse(new TextDecoder().decode(response.body)) as Record<string, unknown>;
    if (body.ok !== true) {
      // `missing_scope` carries the scope it wanted, which is the fix.
      const needed = typeof body.needed === "string" ? ` (needs ${body.needed})` : "";
      throw new Error(`slack ${method} refused: ${String(body.error ?? "unknown error")}${needed}`);
    }
    return { body, headers: response.headers ?? {} };
  }

  /**
   * A file's bytes, with the bot token.
   *
   * Only ever to Slack's own hosts over https: the URL comes out of a message,
   * and the token must not follow one anywhere else.
   */
  async download(url: string, maxBytes?: number): Promise<Uint8Array> {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !isSlackHost(parsed.hostname)) {
      throw new Error(`refusing to send the slack token to ${parsed.origin}`);
    }
    const response = await this.send({ url, method: "GET", headers: { Authorization: `Bearer ${this.token}` }, maxBytes, deadlineMs: this.deadlineMs });
    if (response.status !== 200) throw new Error(`slack file ${parsed.pathname} answered HTTP ${response.status}`);
    // Checked again here for a transport that does not honour the limit.
    if (maxBytes !== undefined && response.body.byteLength > maxBytes) throw new TooLarge(maxBytes);
    return response.body;
  }

  /**
   * The exchange, and the waits a `429` costs, inside one deadline.
   *
   * `Retry-After` is the server's wish, not the call's budget: a `429` that
   * asks for a day cannot be waited out by a call allowed a second, and five
   * such waits are not five attempts within the deadline. The call settles
   * when the next wait no longer fits in what is left.
   */
  private async send(request: HttpRequest): Promise<HttpResponse> {
    const allowed = request.deadlineMs ?? this.deadlineMs;
    const until = Date.now() + allowed;
    for (let attempt = 0; ; attempt++) {
      const response = await this.transport(request);
      if (response.status !== 429) return response;
      if (attempt >= this.maxRetries) {
        throw new Error(`slack kept rate limiting ${request.url} after ${attempt + 1} tries`);
      }
      const wait = retryAfterMs(response.headers?.["retry-after"], this.defaultRetryAfterS);
      const left = until - Date.now();
      if (wait > left) {
        throw new Error(`slack asked to wait ${wait} ms for ${request.url}, past the ${allowed} ms it had`);
      }
      await this.sleep(wait);
    }
  }
}

function retryAfterMs(header: string | undefined, fallbackS: number): number {
  const seconds = header?.trim() ? Number(header) : Number.NaN;
  return (Number.isFinite(seconds) && seconds >= 0 ? seconds : fallbackS) * 1000;
}

function isSlackHost(hostname: string): boolean {
  return hostname === "slack.com" || hostname.endsWith(".slack.com");
}

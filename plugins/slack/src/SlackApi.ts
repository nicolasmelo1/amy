/** One HTTP exchange, small enough to script in a test. */
export interface HttpRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  /** Lower-cased names. */
  headers: Record<string, string>;
  body: Uint8Array;
}

export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;

export const fetchTransport: HttpTransport = async (request) => {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name.toLowerCase()] = value;
  });
  return { status: response.status, headers, body: new Uint8Array(await response.arrayBuffer()) };
};

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
}

/**
 * Slack's answer when it waits without saying for how long: the one-a-minute
 * limit on `conversations.replies` is the one this plugin is likeliest to hit.
 */
const DEFAULT_RETRY_AFTER_S = 60;

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

  constructor(
    private readonly token: string,
    options: SlackApiOptions = {},
  ) {
    this.transport = options.transport ?? fetchTransport;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxRetries = options.maxRateLimitRetries ?? 5;
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
    });
    if (response.status !== 200) throw new Error(`slack ${method} answered HTTP ${response.status}`);

    const body = JSON.parse(new TextDecoder().decode(response.body)) as Record<string, unknown>;
    if (body.ok !== true) {
      // `missing_scope` carries the scope it wanted, which is the fix.
      const needed = typeof body.needed === "string" ? ` (needs ${body.needed})` : "";
      throw new Error(`slack ${method} refused: ${String(body.error ?? "unknown error")}${needed}`);
    }
    return { body, headers: response.headers };
  }

  /**
   * A file's bytes, with the bot token.
   *
   * Only ever to Slack's own hosts over https: the URL comes out of a message,
   * and the token must not follow one anywhere else.
   */
  async download(url: string): Promise<Uint8Array> {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !isSlackHost(parsed.hostname)) {
      throw new Error(`refusing to send the slack token to ${parsed.origin}`);
    }
    const response = await this.send({ url, method: "GET", headers: { Authorization: `Bearer ${this.token}` } });
    if (response.status !== 200) throw new Error(`slack file ${parsed.pathname} answered HTTP ${response.status}`);
    return response.body;
  }

  private async send(request: HttpRequest): Promise<HttpResponse> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.transport(request);
      if (response.status !== 429) return response;
      if (attempt >= this.maxRetries) {
        throw new Error(`slack kept rate limiting ${request.url} after ${attempt + 1} tries`);
      }
      await this.sleep(retryAfterMs(response.headers["retry-after"]));
    }
  }
}

function retryAfterMs(header: string | undefined): number {
  const seconds = header?.trim() ? Number(header) : Number.NaN;
  return (Number.isFinite(seconds) && seconds >= 0 ? seconds : DEFAULT_RETRY_AFTER_S) * 1000;
}

function isSlackHost(hostname: string): boolean {
  return hostname === "slack.com" || hostname.endsWith(".slack.com");
}

import { TooLarge, fetchTransport } from "@amykit/core";
import type { HttpRequest, HttpResponse, HttpTransport } from "@amykit/core";

// The one transport and its shapes, named here too: existing importers of
// this plugin keep one import, and there is no second copy to drift.
export { TooLarge, fetchTransport };
export type { HttpRequest, HttpResponse, HttpTransport };

/** Telegram's own server; a local Bot API server, or a stand-in, is another. */
export const TELEGRAM_API = "https://api.telegram.org";

/** How many times a `429` is waited out before the call fails. */
export const DEFAULT_RATE_LIMIT_RETRIES = 5;

/**
 * How long one exchange may take, body included. Updates are asked for with
 * no long poll, so anything this slow is a server that stopped answering, and
 * holding the bot's lock for it would stall every profile.
 */
export const DEFAULT_DEADLINE_MS = 60_000;

/**
 * What the Bot API answered when it refused, with its `error_code` kept
 * apart, so a 409 is told from a 400 without reading the words.
 */
export class BotApiRefusal extends Error {
  constructor(
    readonly method: string,
    readonly code: number,
    readonly description: string,
  ) {
    super(`telegram ${method} refused: ${code} ${description}`);
  }
}

export interface BotApiOptions {
  server?: string;
  transport?: HttpTransport;
  sleep?: (ms: number) => Promise<void>;
  maxRateLimitRetries?: number;
  deadlineMs?: number;
}

interface Answer {
  ok?: boolean;
  result?: unknown;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

/**
 * The Bot API, called by method name with a JSON body.
 *
 * The token is part of every URL Telegram serves, so no URL is ever put in
 * an error, a log or a file: what goes wrong is said by method name.
 */
export class BotApi {
  private readonly server: string;
  private readonly transport: HttpTransport;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly deadlineMs: number;

  constructor(
    private readonly token: string,
    options: BotApiOptions = {},
  ) {
    this.server = (options.server ?? TELEGRAM_API).replace(/\/+$/, "");
    this.transport = options.transport ?? fetchTransport;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxRetries = options.maxRateLimitRetries ?? DEFAULT_RATE_LIMIT_RETRIES;
    this.deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
  }

  /** The method's `result`, or a {@link BotApiRefusal} when `ok` is false. */
  async call<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.send(method, {
        url: `${this.server}/bot${this.token}/${method}`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
        deadlineMs: this.deadlineMs,
      });
      const answer = parse(method, response);
      if (answer.ok === true) return answer.result as T;
      const code = answer.error_code ?? response.status;
      const retryAfter = answer.parameters?.retry_after;
      if (code === 429 && attempt < this.maxRetries) {
        await this.sleep(Math.max(0, retryAfter ?? 1) * 1000);
        continue;
      }
      // A local server or a proxy may echo the request, and with it the URL.
      throw new BotApiRefusal(method, code, withoutToken(answer.description ?? "no description", this.token));
    }
  }

  /** A file's bytes, by the `file_path` getFile answered, refused past `maxBytes` while they arrive. */
  async download(filePath: string, maxBytes?: number): Promise<Uint8Array> {
    const response = await this.send("file download", {
      url: `${this.server}/file/bot${this.token}/${filePath}`,
      method: "GET",
      headers: {},
      deadlineMs: this.deadlineMs,
      ...(maxBytes === undefined ? {} : { maxBytes }),
    });
    if (response.status !== 200) throw new Error(`telegram file download answered HTTP ${response.status}`);
    // Checked again here for a transport that does not honour the limit.
    if (maxBytes !== undefined && response.body.byteLength > maxBytes) throw new TooLarge(maxBytes);
    return response.body;
  }

  /**
   * The transport's failure, said without the URL that carries the token. The
   * original is not kept as the cause: its message may carry that URL.
   */
  private send(what: string, request: HttpRequest): Promise<HttpResponse> {
    return this.transport(request).catch((error: unknown) => {
      if (error instanceof TooLarge) throw error;
      throw new Error(`telegram ${what} could not be reached: ${withoutToken(error, this.token)}`);
    });
  }
}

function parse(method: string, response: HttpResponse): Answer {
  try {
    return JSON.parse(new TextDecoder().decode(response.body)) as Answer;
  } catch {
    throw new Error(`telegram ${method} answered HTTP ${response.status} with a body that is not JSON`);
  }
}

/** The message with the token taken out, as written and as a URL would encode it, in either case. */
function withoutToken(error: unknown, token: string): string {
  const text = error instanceof Error ? error.message : String(error);
  if (!token) return text;
  const encoded = encodeURIComponent(token);
  const forms = [...new Set([token, encoded, encoded.replace(/%[0-9A-F]{2}/g, (escape) => escape.toLowerCase())])];
  return forms.reduce((said, form) => said.split(form).join("<token>"), text);
}

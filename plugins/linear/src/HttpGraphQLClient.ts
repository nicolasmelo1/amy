import { DEFAULT_HTTP_DEADLINE_MS, fetchTransport } from "@amykit/core";
import type { GraphQLClient, HttpTransport } from "@amykit/core";

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

export interface HttpGraphQLClientOptions {
  transport?: HttpTransport;
  /** How long one exchange may take, body included. */
  deadlineMs?: number;
}

export class HttpGraphQLClient implements GraphQLClient {
  private readonly transport: HttpTransport;
  private readonly deadlineMs: number;

  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    options: HttpGraphQLClientOptions = {},
  ) {
    this.transport = options.transport ?? fetchTransport;
    this.deadlineMs = options.deadlineMs ?? DEFAULT_HTTP_DEADLINE_MS;
  }

  /**
   * Linear takes a personal API key raw and an OAuth token as a bearer, and
   * silently returns nothing useful if you get it the wrong way round.
   */
  private authorization(): string {
    return this.apiKey.startsWith("lin_api_") ? this.apiKey : `Bearer ${this.apiKey}`;
  }

  async request<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    // Through core's one transport: a server that stalls or trickles is cut
    // off at the deadline rather than holding the tick that asked.
    const response = await this.transport({
      url: this.endpoint,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.authorization(),
      },
      body: JSON.stringify({ query, variables }),
      deadlineMs: this.deadlineMs,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`${this.endpoint} answered ${response.status}`);
    }

    const payload = JSON.parse(new TextDecoder().decode(response.body)) as GraphQLResponse<T>;

    if (payload.errors?.length) {
      throw new Error(payload.errors.map((e) => e.message).join("; "));
    }

    if (!payload.data) {
      throw new Error(`${this.endpoint} returned no data`);
    }

    return payload.data;
  }
}

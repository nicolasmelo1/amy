import { GraphQLClient } from "@amy/core";

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

export class HttpGraphQLClient implements GraphQLClient {
  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
  ) {}

  /**
   * Linear takes a personal API key raw and an OAuth token as a bearer, and
   * silently returns nothing useful if you get it the wrong way round.
   */
  private authorization(): string {
    return this.apiKey.startsWith("lin_api_") ? this.apiKey : `Bearer ${this.apiKey}`;
  }

  async request<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.authorization(),
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`${this.endpoint} answered ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as GraphQLResponse<T>;

    if (payload.errors?.length) {
      throw new Error(payload.errors.map((e) => e.message).join("; "));
    }

    if (!payload.data) {
      throw new Error(`${this.endpoint} returned no data`);
    }

    return payload.data;
  }
}

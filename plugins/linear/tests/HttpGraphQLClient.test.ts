import { describe, it, expect, vi, afterEach } from "vitest";
import { HttpGraphQLClient } from "../src/HttpGraphQLClient.js";
import { configSchema } from "../src/config.js";
import { LINEAR_ENDPOINT } from "../src/LinearTracker.js";

interface Sent {
  url: string;
  authorization: string;
  body: { query: string; variables: Record<string, unknown> };
}

/** Records what was posted and answers with the payload given. */
function stubFetch(payload: unknown, ok = true): Sent[] {
  const sent: Sent[] = [];

  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    sent.push({
      url,
      authorization: headers.Authorization!,
      body: JSON.parse(init.body as string),
    });

    return Promise.resolve({
      ok,
      status: ok ? 200 : 503,
      statusText: ok ? "OK" : "Service Unavailable",
      json: () => Promise.resolve(payload),
    } as Response);
  });

  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpGraphQLClient", () => {
  it("posts to the endpoint it was given, not to a compiled-in one", async () => {
    const sent = stubFetch({ data: { viewer: { id: "u-1" } } });

    const answer = await new HttpGraphQLClient("http://127.0.0.1:7654/graphql", "lin_api_x").request(
      "query Viewer { viewer { id } }",
    );

    expect(answer).toEqual({ viewer: { id: "u-1" } });
    expect(sent[0]!.url).toBe("http://127.0.0.1:7654/graphql");
    expect(sent[0]!.body).toEqual({ query: "query Viewer { viewer { id } }", variables: {} });
  });

  // Getting this the wrong way round does not error against the real API. It
  // returns nothing useful, which is the worst way for it to be wrong.
  it("sends a personal key raw and an OAuth token as a bearer", async () => {
    const personal = stubFetch({ data: {} });
    await new HttpGraphQLClient("http://tracker.test/graphql", "lin_api_personal").request("{}");
    expect(personal[0]!.authorization).toBe("lin_api_personal");

    vi.unstubAllGlobals();

    const oauth = stubFetch({ data: {} });
    await new HttpGraphQLClient("http://tracker.test/graphql", "oauth-token").request("{}");
    expect(oauth[0]!.authorization).toBe("Bearer oauth-token");
  });

  it("names the endpoint when it answers with a status", async () => {
    stubFetch({}, false);

    await expect(
      new HttpGraphQLClient("http://tracker.test/graphql", "k").request("{}"),
    ).rejects.toThrow("http://tracker.test/graphql answered 503");
  });

  it("raises what the API complained about rather than a missing field later", async () => {
    stubFetch({ errors: [{ message: "Entity not found" }] });

    await expect(
      new HttpGraphQLClient("http://tracker.test/graphql", "k").request("{}"),
    ).rejects.toThrow("Entity not found");
  });

  it("defaults to Linear's own endpoint, so only a test moves it", () => {
    expect(configSchema.endpoint!.default).toBe(LINEAR_ENDPOINT);
    expect(LINEAR_ENDPOINT).toBe("https://api.linear.app/graphql");
  });
});

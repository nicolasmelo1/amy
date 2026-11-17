import { describe, it, expect } from "vitest";
import type { HttpRequest } from "@amykit/core";
import { HttpGraphQLClient } from "../src/HttpGraphQLClient.js";
import { configSchema } from "../src/config.js";
import { LINEAR_ENDPOINT } from "../src/LinearTracker.js";

interface Sent {
  url: string;
  authorization: string;
  deadlineMs?: number;
  body: { query: string; variables: Record<string, unknown> };
}

/** Records what was posted and answers with the payload given. */
function stub(payload: unknown, status = 200): { sent: Sent[]; transport: (request: HttpRequest) => Promise<{ status: number; body: Uint8Array }> } {
  const sent: Sent[] = [];
  const transport = async (request: HttpRequest) => {
    sent.push({
      url: request.url,
      authorization: request.headers.Authorization ?? "",
      deadlineMs: request.deadlineMs,
      body: JSON.parse(request.body ?? "{}") as Sent["body"],
    });
    return { status, body: new TextEncoder().encode(JSON.stringify(payload)) };
  };
  return { sent, transport };
}

describe("HttpGraphQLClient", () => {
  it("posts to the endpoint it was given, not to a compiled-in one", async () => {
    const { sent, transport } = stub({ data: { viewer: { id: "u-1" } } });

    const answer = await new HttpGraphQLClient("http://127.0.0.1:7654/graphql", "lin_api_x", { transport }).request(
      "query Viewer { viewer { id } }",
    );

    expect(answer).toEqual({ viewer: { id: "u-1" } });
    expect(sent[0]?.url).toBe("http://127.0.0.1:7654/graphql");
    expect(sent[0]?.body).toEqual({ query: "query Viewer { viewer { id } }", variables: {} });
  });

  // Getting this the wrong way round does not error against the real API. It
  // returns nothing useful, which is the worst way for it to be wrong.
  it("sends a personal key raw and an OAuth token as a bearer", async () => {
    const personal = stub({ data: {} });
    await new HttpGraphQLClient("http://tracker.test/graphql", "lin_api_personal", { transport: personal.transport }).request("{");
    expect(personal.sent[0]?.authorization).toBe("lin_api_personal");

    const oauth = stub({ data: {} });
    await new HttpGraphQLClient("http://tracker.test/graphql", "oauth-token", { transport: oauth.transport }).request("{");
    expect(oauth.sent[0]?.authorization).toBe("Bearer oauth-token");
  });

  it("gives every exchange a deadline, so a stalled server cannot hold the tick", async () => {
    const { sent, transport } = stub({ data: {} });

    await new HttpGraphQLClient("http://tracker.test/graphql", "k", { transport, deadlineMs: 2_500 }).request("{");

    expect(sent[0]?.deadlineMs).toBe(2_500);
  });

  it("names the endpoint when it answers with a status", async () => {
    const { transport } = stub({}, 503);

    await expect(new HttpGraphQLClient("http://tracker.test/graphql", "k", { transport }).request("{")).rejects.toThrow(
      "http://tracker.test/graphql answered 503",
    );
  });

  it("raises what the API complained about rather than a missing field later", async () => {
    const { transport } = stub({ errors: [{ message: "Entity not found" }] });

    await expect(new HttpGraphQLClient("http://tracker.test/graphql", "k", { transport }).request("{")).rejects.toThrow("Entity not found");
  });

  it("defaults to Linear's own endpoint, so only a test moves it", () => {
    expect(configSchema.endpoint?.default).toBe(LINEAR_ENDPOINT);
    expect(LINEAR_ENDPOINT).toBe("https://api.linear.app/graphql");
  });
});

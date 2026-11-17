import { describe, expect, it } from "vitest";
import type { HttpRequest, HttpResponse } from "@amykit/core";
import { SlackApi } from "../src/SlackApi.js";

/**
 * A server that answers every call with a 429 and a wait far longer than the
 * call allowed itself. Whatever the server asks for, the call settles within
 * its own deadline: the waits it spends count against it.
 */
function rateLimited(retryAfterSeconds: string): (request: HttpRequest) => Promise<HttpResponse> {
  return async () => ({ status: 429, headers: { "retry-after": retryAfterSeconds }, body: new TextEncoder().encode("{}") });
}

describe("a rate-limited call", () => {
  it.each(["3600", "86400"])("settles within its deadline when the server asks to wait %s seconds", async (retryAfter) => {
    const waited: number[] = [];
    const api = new SlackApi("xoxb-test", {
      transport: rateLimited(retryAfter),
      sleep: async (ms) => {
        waited.push(ms);
      },
      deadlineMs: 1_000,
    });

    await expect(api.call("conversations.replies", { channel: "C1", ts: "1.0" })).rejects.toThrow();
    expect(waited.reduce((total, ms) => total + ms, 0)).toBeLessThanOrEqual(1_000);
  });

  it("settles within its deadline when the server names no wait at all", async () => {
    const waited: number[] = [];
    const api = new SlackApi("xoxb-test", {
      transport: rateLimited(""),
      sleep: async (ms) => {
        waited.push(ms);
      },
      deadlineMs: 1_000,
    });

    await expect(api.call("conversations.replies", { channel: "C1", ts: "1.0" })).rejects.toThrow();
    expect(waited.reduce((total, ms) => total + ms, 0)).toBeLessThanOrEqual(1_000);
  });
});

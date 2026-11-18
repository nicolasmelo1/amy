import http from "node:http";
import { AddressInfo } from "node:net";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchTransport } from "../src/http.js";

const FALSIFIER = "a_fetch_without_a_signal";
const planted = process.env.SF_FALSIFIER === FALSIFIER;

/** The mutation the property must reject: the fetch Slack and Linear made, with no deadline. */
const withoutDeadline: typeof fetchTransport = async (request) => {
  const response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body });
  return { status: response.status, headers: {}, body: new Uint8Array(await response.arrayBuffer()) };
};

const transport = planted ? withoutDeadline : fetchTransport;

/**
 * A server that answers nothing, or answers a byte at a time: the two shapes
 * the 2026-11-15 probe measured, and the two a deadline has to cut off.
 */
let server: http.Server;
let base: string;
let host: string;

beforeAll(async () => {
  server = http.createServer((request, response) => {
    if (request.url === "/trickle") {
      response.writeHead(200, { "Content-Type": "application/octet-stream" });
      const drip = setInterval(() => response.write("x"), 100);
      request.on("close", () => clearInterval(drip));
      return;
    }
    // /stall: headers never arrive, and the socket stays open.
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
  host = `127.0.0.1:${port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe("an exchange", () => {
  it(
    "a_fetch_without_a_signal",
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 60, max: 260 }), fc.boolean(), async (deadlineMs, trickles) => {
          const started = Date.now();
          const failure = await transport({
            url: `${base}/${trickles ? "trickle" : "stall"}`,
            method: "GET",
            headers: {},
            deadlineMs,
          }).then(
            () => undefined,
            (error: unknown) => error,
          );

          // Settled, and settled itself: the call names what it waited for
          // and how long it allowed.
          expect(failure).toBeInstanceOf(Error);
          expect((failure as Error).message).toContain(host);
          expect((failure as Error).message).toContain(`${deadlineMs} ms`);
          expect(Date.now() - started).toBeLessThan(deadlineMs + 1200);
        }),
        { numRuns: 4 },
      );
    },
    20_000,
  );
});

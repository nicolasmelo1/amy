import http from "node:http";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TooLarge, fetchTransport } from "../src/index.js";

/**
 * The one transport that reaches the network, against a local server: the
 * byte limit has to hold while the body arrives, not after it is in memory.
 */
let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((request, response) => {
    if (request.url === "/declared") {
      response.writeHead(200, { "Content-Length": "10" });
      response.end("0123456789");
      return;
    }
    // Chunked: no length declared, so only counting can catch it.
    response.writeHead(200, { "Content-Type": "application/octet-stream" });
    response.write("01234");
    response.end("56789");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("fetchTransport", () => {
  it("returns the whole body under the limit, with lower-cased headers", async () => {
    const response = await fetchTransport({ url: `${base}/declared`, method: "GET", headers: {}, maxBytes: 10 });

    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(response.body)).toBe("0123456789");
    expect(response.headers["content-length"]).toBe("10");
  });

  it("refuses unread a body whose declared length is over the limit", async () => {
    await expect(fetchTransport({ url: `${base}/declared`, method: "GET", headers: {}, maxBytes: 9 })).rejects.toBeInstanceOf(TooLarge);
  });

  it("refuses a body that declared no length once it counts past the limit", async () => {
    await expect(fetchTransport({ url: `${base}/chunked`, method: "GET", headers: {}, maxBytes: 7 })).rejects.toBeInstanceOf(TooLarge);
  });

  it("reads a body with no limit asked for", async () => {
    const response = await fetchTransport({ url: `${base}/chunked`, method: "GET", headers: {} });

    expect(new TextDecoder().decode(response.body)).toBe("0123456789");
  });
});

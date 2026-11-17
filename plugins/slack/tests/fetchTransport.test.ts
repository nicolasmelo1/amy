import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TooLarge, fetchTransport } from "../src/index.js";

/**
 * The one transport that reaches the network, against a local server: the
 * byte limit has to hold while the body arrives, not after it is in memory,
 * and a server that stops answering has to be cut off at the deadline.
 */
let server: http.Server;
let base: string;
let host: string;

beforeAll(async () => {
  server = http.createServer((request, response) => {
    if (request.url === "/declared") {
      response.writeHead(200, { "Content-Length": "10" });
      response.end("0123456789");
      return;
    }
    if (request.url === "/stall") return;
    // Chunked: no length declared, so only counting can catch it.
    response.writeHead(200, { "Content-Type": "application/octet-stream" });
    response.write("01234");
    response.end("56789");
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

describe("fetchTransport", () => {
  it("returns the whole body under the limit, with lower-cased headers", async () => {
    const response = await fetchTransport({ url: `${base}/declared`, method: "GET", headers: {}, maxBytes: 10 });

    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(response.body)).toBe("0123456789");
    expect(response.headers?.["content-length"]).toBe("10");
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

  it("ends a call to a server that never answers, naming the host and the deadline", async () => {
    const started = Date.now();

    await expect(fetchTransport({ url: `${base}/stall`, method: "GET", headers: {}, deadlineMs: 200 })).rejects.toThrow(
      `${host} did not answer within 200 ms`,
    );
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

/** Every source file under a directory, without a build output or a dependency. */
function sources(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "dist" || entry.name === "node_modules" ? [] : sources(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

describe("a request", () => {
  it("has one transport, and no bare fetch anywhere else", () => {
    const roots = ["packages", "plugins", "examples"].map((one) => path.join(process.cwd(), one));
    const guilty = roots
      .flatMap((root) => sources(root))
      .flatMap((file) => {
        const relative = path.relative(process.cwd(), file).split(path.sep).join("/");
        if (!relative.includes("/src/") || relative === "packages/core/src/http.ts") return [];
        return fs
          .readFileSync(file, "utf-8")
          .split("\n")
          .filter((line) => /(^|[^.\w])fetch\(/.test(line))
          .map((line) => `${relative}: ${line.trim()}`);
      });

    expect(guilty).toEqual([]);
  });
});

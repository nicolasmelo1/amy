// A static npm registry on a loopback port, so the amy-update scenario talks
// to real npm through `--registry` and npm's own semver resolves every range.
// The stand-in it replaces answered `view` with whatever it held, whatever
// range it was asked about, which is exactly the thing an update must get
// right.
//
// Every `*.tgz` in <state>/tarballs is published, read again on each request
// so the scenario can publish a version the way a real registry gains one.
// A name no tarball carries is answered from this checkout's node_modules —
// `yaml`, `commander` — packed on first use, so nothing needs a network.
//
// Each packument request is one line of <state>/requests.log, which is how
// the scenario counts the updates a schedule ran; a request for the marked
// name also appends `update` to the mark file, the log the workflow writes
// `workflow` into, so the two land in the order they happened.
//
// Usage: tsx registry.ts <state-dir> <fallback-node-modules> [<marked-name> <mark-file>]
// Prints the URL it listens on, and writes it to <state-dir>/url.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import zlib from "node:zlib";

const [state, fallback, marked, markFile] = process.argv.slice(2);
if (state === undefined || fallback === undefined) {
  console.error("usage: registry.ts <state-dir> <fallback-node-modules>");
  process.exit(2);
}
const tarballs = path.join(state, "tarballs");
const packed = path.join(state, "fallback");
fs.mkdirSync(tarballs, { recursive: true });
fs.mkdirSync(packed, { recursive: true });

interface Manifest {
  name: string;
  version: string;
  [field: string]: unknown;
}

interface Published {
  manifest: Manifest;
  file: string;
}

/** The `package/package.json` inside a gzipped tarball, read without unpacking it. */
export function manifestIn(tgz: Buffer): Manifest {
  const tar = zlib.gunzipSync(tgz);
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString("utf-8").replace(/\0.*$/s, "");
    if (name === "") break;
    const prefix = header.subarray(345, 500).toString("utf-8").replace(/\0.*$/s, "");
    const size = Number.parseInt(header.subarray(124, 136).toString("utf-8").replace(/\0.*$/s, "").trim() || "0", 8);
    const full = prefix === "" ? name : `${prefix}/${name}`;
    if (full.replace(/^[^/]+\//, "") === "package.json") {
      return JSON.parse(tar.subarray(offset + 512, offset + 512 + size).toString("utf-8")) as Manifest;
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error("the tarball carries no package.json");
}

/** Every version of `name` this registry publishes, newest last. */
function versionsOf(name: string): Published[] {
  const found = [tarballs, packed].flatMap((directory) =>
    fs.readdirSync(directory)
      .filter((file) => file.endsWith(".tgz"))
      .map((file) => ({ manifest: manifestIn(fs.readFileSync(path.join(directory, file))), file: path.join(directory, file) }))
      .filter((one) => one.manifest.name === name),
  );
  if (found.length === 0) {
    const copy = packFallback(name);
    if (copy !== undefined) found.push(copy);
  }
  return found.sort((a, b) => compare(a.manifest.version, b.manifest.version));
}

/** Packs this checkout's own copy of a third-party package, once. */
function packFallback(name: string): Published | undefined {
  const directory = path.join(fallback ?? "", ...name.split("/"));
  if (!fs.existsSync(path.join(directory, "package.json"))) return undefined;
  const result = spawnSync("npm", ["pack", directory, "--ignore-scripts", "--pack-destination", packed, "--json"], {
    encoding: "utf-8",
  });
  if (result.status !== 0) return undefined;
  const [entry] = JSON.parse(result.stdout) as Array<{ filename: string }>;
  if (entry === undefined) return undefined;
  const file = path.join(packed, entry.filename.replace(/^@/, "").replace("/", "-"));
  return { manifest: manifestIn(fs.readFileSync(file)), file };
}

/** Release versions by their numbers; a prerelease sorts before its release. */
function compare(a: string, b: string): number {
  const parts = (version: string) => version.split(/[.+-]/).slice(0, 3).map(Number);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i += 1) {
    const difference = (x[i] ?? 0) - (y[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return Number(a.includes("-") ? 0 : 1) - Number(b.includes("-") ? 0 : 1);
}

/** The document npm asks for by name, with every tarball addressed on this server. */
function packument(name: string, base: string): object | undefined {
  const versions = versionsOf(name);
  const latest = versions.filter((one) => !one.manifest.version.includes("-")).at(-1) ?? versions.at(-1);
  if (latest === undefined) return undefined;
  return {
    name,
    "dist-tags": { latest: latest.manifest.version },
    versions: Object.fromEntries(versions.map(({ manifest, file }) => {
      const bytes = fs.readFileSync(file);
      return [manifest.version, {
        ...manifest,
        _id: `${name}@${manifest.version}`,
        dist: {
          tarball: `${base}/-/${encodeURIComponent(path.relative(state ?? "", file))}`,
          integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
          shasum: createHash("sha1").update(bytes).digest("hex"),
        },
      }];
    })),
  };
}

const server = http.createServer((request, response) => {
  const base = `http://${request.headers.host ?? "127.0.0.1"}`;
  const url = decodeURIComponent((request.url ?? "/").split("?")[0] ?? "/");
  if (url.startsWith("/-/")) {
    const file = path.resolve(state, url.slice(3));
    if (!file.startsWith(path.resolve(state) + path.sep) || !fs.existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/octet-stream" }).end(fs.readFileSync(file));
    return;
  }
  const name = url.slice(1);
  fs.appendFileSync(path.join(state, "requests.log"), `${name}\n`);
  if (name === marked && markFile !== undefined) {
    fs.mkdirSync(path.dirname(markFile), { recursive: true });
    fs.appendFileSync(markFile, "update\n");
  }
  const document = packument(name, base);
  if (document === undefined) {
    response.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "not found" }));
    return;
  }
  response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(document));
});

server.listen(0, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fs.writeFileSync(path.join(state, "url"), `${url}\n`);
  console.log(url);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));

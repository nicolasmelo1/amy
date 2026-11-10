import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { readmeNodeBadge, readmeNodeVersion } from "../blocks.js";
import { navGroups, readmeProblems, said } from "../prose.js";
import { runtimeFacts } from "../sources/runtime.js";

const root = path.resolve(import.meta.dirname, "../../..");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const nav = navGroups(fs.readFileSync(path.join(root, "docs/nav.yaml"), "utf8"));

/** The front door is a summary: it points everywhere and installs in two commands. */
describe("the root README", () => {
  it("holds to every proxy for being a summary", () => {
    expect(readmeProblems(readme, nav).map(said)).toEqual([]);
  });

  it("fails when it drops the link to a nav group", () => {
    const group = nav[0]!;
    const dropped = readme.replaceAll(`(docs/${group.dir}/`, "(#/").replaceAll(`href="docs/${group.dir}/`, 'href="#/');
    expect(readmeProblems(dropped, nav).map((one) => one.detail)).toContain(`links nothing in the nav group "${group.group}" (docs/${group.dir}/)`);
  });

  it("fails when a section ends without a link", () => {
    const sections = readme.split(/\n(?=## )/);
    const last = `${sections.at(-1)!.trimEnd()}\n\nA closing line with no link.\n`;
    expect(readmeProblems([...sections.slice(0, -1), last].join("\n"), nav).map((one) => one.detail).join()).toMatch(/does not end in a link/);
  });

  it("fails when it installs in more than two commands", () => {
    const install = readme.replace(/(## [^\n]*Install[^\n]*\n[\s\S]*?```sh\n)/i, "$1amy doctor\n");
    expect(readmeProblems(install, nav).map((one) => one.detail).join()).toMatch(/installs in 3 commands; at most two/);
  });

  it("names the harnesses it runs on and points agents at amy's skills", () => {
    for (const harness of ["Claude Code", "Codex", "Hermes"]) {
      expect(readmeProblems(readme.replaceAll(harness, "a harness"), nav).map((one) => one.detail)).toContain(`does not name ${harness}`);
    }
  });

  it("shows assets/logo.png, whose four corners are fully transparent", () => {
    expect(readme).toMatch(/src="assets\/logo\.png"|\]\(assets\/logo\.png\)/);
    expect(fs.existsSync(path.join(root, "assets/amy-mark.png"))).toBe(false);

    const image = decodePng(fs.readFileSync(path.join(root, "assets/logo.png")));
    const corners = [
      [0, 0],
      [image.width - 1, 0],
      [0, image.height - 1],
      [image.width - 1, image.height - 1],
    ] as const;
    for (const [x, y] of corners) expect(image.alpha(x, y), `alpha at ${x},${y}`).toBe(0);
  });

  it("reads the Node requirement from the package that runs", () => {
    const runtime = runtimeFacts();
    expect(readme).toContain(readmeNodeBadge(runtime));
    expect(fs.readFileSync(path.join(root, "docs/start/installation.md"), "utf8")).toContain(readmeNodeVersion(runtime));
  });
});

/** Enough of PNG to read the alpha of an 8-bit RGBA or grey-and-alpha image. */
function decodePng(data: Buffer): { width: number; height: number; alpha: (x: number, y: number) => number } {
  expect(data.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  const chunks = chunksOf(data);
  const header = chunks.find((chunk) => chunk.kind === "IHDR")!.body;
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  expect(header[8], "bit depth").toBe(8);
  expect(header[12], "interlace").toBe(0);
  expect([4, 6], "a colour type with alpha").toContain(header[9]);

  const channels = header[9] === 6 ? 4 : 2;
  const raw = zlib.inflateSync(Buffer.concat(chunks.filter((chunk) => chunk.kind === "IDAT").map((chunk) => chunk.body)));
  const pixels = unfiltered(raw, width * channels, height, channels);
  return { width, height, alpha: (x, y) => pixels[y * width * channels + x * channels + channels - 1]! };
}

function chunksOf(data: Buffer): { kind: string; body: Buffer }[] {
  const chunks: { kind: string; body: Buffer }[] = [];
  for (let offset = 8; offset < data.length; offset += 12 + data.readUInt32BE(offset)) {
    const length = data.readUInt32BE(offset);
    chunks.push({ kind: data.subarray(offset + 4, offset + 8).toString("ascii"), body: data.subarray(offset + 8, offset + 8 + length) });
  }
  return chunks;
}

/** The scanlines with each one's filter undone, so every byte is the sample itself. */
function unfiltered(raw: Buffer, stride: number, height: number, channels: number): Buffer {
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels[y * stride + x - channels]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const corner = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels]! : 0;
      pixels[y * stride + x] = (raw[y * (stride + 1) + 1 + x]! + predicted(filter, left, up, corner)) & 0xff;
    }
  }
  return pixels;
}

function predicted(filter: number, left: number, up: number, corner: number): number {
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) return paeth(left, up, corner);
  return 0;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

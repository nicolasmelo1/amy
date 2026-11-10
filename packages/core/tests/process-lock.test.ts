import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processAlive, takeLock } from "../src/process-lock.js";

const repository = path.resolve(import.meta.dirname, "..", "..", "..");
const source = path.resolve(import.meta.dirname, "..", "src", "process-lock.ts");
const DEAD = 2147483647;

const lockIn = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "amy-process-lock-")), "thing.lock");
const tombstoneOf = (file: string, stamp: string) => `${file}.dead-${createHash("sha256").update(stamp).digest("hex").slice(0, 16)}`;
const aged = (file: string, ms: number) => {
  const at = new Date(Date.now() - ms);
  fs.utimesSync(file, at, at);
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("whether a process lives", () => {
  it("is yes for this one and no for a made-up, a zero or a negative id", () => {
    expect(processAlive(process.pid)).toBe(true);
    expect(processAlive(DEAD)).toBe(false);
    expect(processAlive(0)).toBe(false);
    expect(processAlive(-1)).toBe(false);
    expect(processAlive(1.5)).toBe(false);
  });
});

describe("a lock", () => {
  it("is held by one taker at a time, and only its own holding lets it go", () => {
    const file = lockIn();
    const first = takeLock(file)!;
    expect(first.holds()).toBe(true);
    expect(takeLock(file)).toBeUndefined();

    const owner = fs.readFileSync(file, "utf-8");
    expect(JSON.parse(owner)).toEqual({ pid: process.pid, stamp: first.stamp });

    first.release();
    const second = takeLock(file)!;
    // A stale handle never removes the lock that replaced it.
    first.release();
    expect(second.holds()).toBe(true);
    expect(first.holds()).toBe(false);
  });

  it("is published whole: the owner is in the file from the moment it exists, and nothing staged is left", () => {
    const file = lockIn();
    takeLock(file);
    expect(fs.readFileSync(file, "utf-8")).toMatch(/"stamp":/);
    expect(fs.readdirSync(path.dirname(file))).toEqual(["thing.lock"]);
  });

  it("is never read as abandoned while it is empty or names nobody, until the grace passes", () => {
    const file = lockIn();
    fs.writeFileSync(file, "");
    expect(takeLock(file)).toBeUndefined();
    aged(file, 11_000);
    expect(takeLock(file)).toBeDefined();
  });

  it("is taken over once its owner's process is gone, and kept while it lives however old", () => {
    const file = lockIn();
    fs.writeFileSync(file, `${JSON.stringify({ pid: process.pid, stamp: "alive" })}\n`);
    aged(file, 24 * 60 * 60 * 1000);
    expect(takeLock(file)).toBeUndefined();

    fs.writeFileSync(file, `${JSON.stringify({ pid: DEAD, stamp: "dead" })}\n`);
    const taken = takeLock(file)!;
    expect(taken.holds()).toBe(true);
    // A writer arriving after the takeover finds the new owner alive, and leaves it.
    expect(takeLock(file)).toBeUndefined();
    expect(taken.holds()).toBe(true);
  });

  it("taken with a lease, is taken over once unrenewed past it, alive or not, and renewing keeps it", () => {
    const file = lockIn();
    let clock = Date.now();
    const options = { leaseMs: 60_000, now: () => clock };
    const held = takeLock(file, options)!;

    clock += 50_000;
    expect(held.renew()).toBe(true);
    clock += 50_000;
    expect(takeLock(file, options)).toBeUndefined();

    clock += 61_000;
    const next = takeLock(file, options)!;
    expect(next.holds()).toBe(true);
    expect(held.renew()).toBe(false);
    expect(held.holds()).toBe(false);
  });
});

describe("a lock an earlier version left", () => {
  it.each([
    ["a pid line", (pid: number) => `${pid}\n`],
    ["a pid:token line", (pid: number) => `${pid}:4b1e`],
  ])("in %s is held while its process lives and taken over once it is gone", (_, text) => {
    const file = lockIn();
    fs.writeFileSync(file, text(process.pid));
    expect(takeLock(file)).toBeUndefined();
    fs.writeFileSync(file, text(DEAD));
    expect(takeLock(file)?.holds()).toBe(true);
  });

  it("as a bare token is held while fresh and taken over once stale", () => {
    const file = lockIn();
    fs.writeFileSync(file, "a loop that died");
    expect(takeLock(file, { graceMs: 1000 })).toBeUndefined();
    aged(file, 2000);
    expect(takeLock(file, { graceMs: 1000 })?.holds()).toBe(true);
  });

  it("as a directory holding owner.json is held while its process lives and taken over once it is gone", () => {
    const file = lockIn();
    fs.mkdirSync(file);
    fs.writeFileSync(path.join(file, "owner.json"), JSON.stringify({ pid: process.pid, stamp: "mine" }));
    expect(takeLock(file)).toBeUndefined();

    fs.writeFileSync(path.join(file, "owner.json"), JSON.stringify({ pid: DEAD, stamp: "gone" }));
    const taken = takeLock(file)!;
    expect(taken.holds()).toBe(true);
    expect(fs.statSync(file).isFile()).toBe(true);
  });
});

describe("a dead owner's lock", () => {
  it("is left to the process burying it", () => {
    const file = lockIn();
    fs.writeFileSync(file, `${JSON.stringify({ pid: DEAD, stamp: "dead" })}\n`);
    fs.linkSync(file, tombstoneOf(file, "dead"));
    expect(takeLock(file)).toBeUndefined();
  });

  it("is buried again once the tombstone of a process that died burying it is swept, an hour on", () => {
    const file = lockIn();
    fs.writeFileSync(file, `${JSON.stringify({ pid: DEAD, stamp: "dead" })}\n`);
    fs.linkSync(file, tombstoneOf(file, "dead"));
    const ten = Date.now() + 11_000;
    vi.spyOn(Date, "now").mockReturnValue(ten);
    // Ten seconds on, the burier may only be slow: two finishing it could remove a new owner's lock.
    expect(takeLock(file, { now: () => ten })).toBeUndefined();
    const hour = Date.now() + 61 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(hour);
    expect(takeLock(file, { now: () => hour })?.holds()).toBe(true);
  });

  it("is taken by exactly one of six processes racing for it", async () => {
    const file = lockIn();
    fs.writeFileSync(file, `${JSON.stringify({ pid: DEAD, stamp: "dead" })}\n`);
    const script = path.join(path.dirname(file), "take.mts");
    fs.writeFileSync(script, [
      `import { takeLock } from ${JSON.stringify(pathToFileURL(source).href)};`,
      "const [file, start] = process.argv.slice(2);",
      "while (Date.now() < Number(start)) {}",
      "const held = takeLock(file);",
      "process.stdout.write(held ? `held ${held.stamp}` : \"waiting\");",
      // Holding it a moment, so a racer that comes late meets a live owner rather than an empty path.
      "if (held) { const until = Date.now() + 1500; while (Date.now() < until) {} }",
    ].join("\n"));
    const start = Date.now() + 1500;
    const racers = Array.from({ length: 6 }, () => new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", script, file, String(start)], { cwd: repository });
      let out = "";
      child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString(); });
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`racer exited ${code}`))));
    }));

    const answers = await Promise.all(racers);

    expect(answers.filter((one) => one.startsWith("held"))).toHaveLength(1);
  }, 30_000);
});

describe("asking whether a process lives", () => {
  it("is done by the core's lock alone: no other source calls process.kill with signal 0", () => {
    const roots = ["packages", "plugins", "examples"].flatMap((top) =>
      fs.readdirSync(path.join(repository, top), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => path.join(repository, top, entry.name, "src")));
    const offenders: string[] = [];
    const walk = (directory: string) => {
      if (!fs.existsSync(directory)) return;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (/\.tsx?$/.test(entry.name) && file !== source && /process\.kill\([^,()]+,\s*0\s*\)/.test(fs.readFileSync(file, "utf-8"))) {
          offenders.push(path.relative(repository, file));
        }
      }
    };
    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });
});

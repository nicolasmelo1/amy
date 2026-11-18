import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

const FALSIFIER = "a_stale_lock_renamed_blindly";
const planted = process.env.SF_FALSIFIER === FALSIFIER;

const TSX = path.join(process.cwd(), "node_modules", ".bin", "tsx");
const CORE = path.join(process.cwd(), "packages/core/src/process-lock.ts");

/** The mutation the property must reject: a stale lock renamed aside without re-reading it. */
const plantedHolder = `
import fs from "node:fs";
import path from "node:path";
const [directory, me] = process.argv.slice(2);
const lock = path.join(directory, "lock");
const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const lease = 1000;
const claim = () => { try { fs.mkdirSync(lock); } catch (error) { if (error.code !== "EEXIST") throw error; return false; } fs.writeFileSync(path.join(lock, "owner"), me); return true; };
while (!claim()) {
  const since = fs.statSync(lock).mtimeMs;
  if (Date.now() - since > lease) {
    // The gap the tombstone exists to close: the lock judged stale may be
    // another process's new one by the time it is moved.
    wait(25);
    try { fs.renameSync(lock, lock + ".stale-" + me); } catch {}
    continue;
  }
  wait(5);
}
fs.writeFileSync(path.join(directory, "holder"), me);
wait(30);
if (fs.readFileSync(path.join(directory, "holder"), "utf-8") !== me) fs.writeFileSync(path.join(directory, "conflict"), me);
fs.rmSync(lock, { recursive: true, force: true });
`;

/** The bot's hold, through core's takeLock: one holder, a stale one buried. */
const realHolder = `
import fs from "node:fs";
import path from "node:path";
import { takeLock } from ${JSON.stringify(CORE)};
const [directory, me] = process.argv.slice(2);
const lock = path.join(directory, "lock");
const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
let held = takeLock(lock, { leaseMs: 1000 });
while (!held) { wait(5); held = takeLock(lock, { leaseMs: 1000 }); }
fs.writeFileSync(path.join(directory, "holder"), me);
wait(30);
if (fs.readFileSync(path.join(directory, "holder"), "utf-8") !== me) fs.writeFileSync(path.join(directory, "conflict"), me);
held.release();
`;

function run(script: string, args: readonly string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(TSX, [script, ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

describe("the bot's lock", () => {
  it("a_stale_lock_renamed_blindly", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 6 }), async (holders) => {
        // Inside the repository, so the script resolves `@amykit/core` the
        // way the plugin does; removed before the property returns.
        const directory = fs.mkdtempSync(path.join(process.cwd(), ".tmp-bot-lock-"));
        try {
          // An hour-old lock: the shape the probe found two holders behind.
          const stale = path.join(directory, "lock");
          fs.mkdirSync(stale, { recursive: true });
          fs.writeFileSync(path.join(stale, "owner"), "an-amy-that-is-gone", { mode: 0o600 });
          const anHourAgo = new Date(Date.now() - 3_600_000);
          fs.utimesSync(stale, anHourAgo, anHourAgo);

          fs.writeFileSync(path.join(directory, "hold.ts"), planted ? plantedHolder : realHolder, "utf-8");
          const finished = await Promise.all(
            Array.from({ length: holders }, (_, me) => run(path.join(directory, "hold.ts"), [directory, String(me)])),
          );

          expect(finished.map((one) => one.stderr)).toEqual(Array.from({ length: holders }, () => ""));
          expect(finished.map((one) => one.code)).toEqual(Array.from({ length: holders }, () => 0));
          // Never two at once, and no claim threw.
          expect(fs.existsSync(path.join(directory, "conflict"))).toBe(false);
        } finally {
          fs.rmSync(directory, { recursive: true, force: true });
        }
      }),
      { numRuns: 3 },
    );
  }, 60_000);

  it("the bot holds through core's one lock", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "plugins/telegram/src/TelegramConversation.ts"), "utf-8");
    expect(source).toContain('takeLock(lock, { leaseMs: lease })');
    // The blind rename-aside is what let two processes bury each other.
    expect(source).not.toMatch(/renameSync\(lock/);
  });
});

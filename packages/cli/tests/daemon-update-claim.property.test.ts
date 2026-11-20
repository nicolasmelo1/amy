import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

const FALSIFIER = "recover_acts_on_a_stale_read";
const planted = process.env.SF_FALSIFIER === FALSIFIER;
const PROFILE = "oncall";

/** One starter, taking the due through the product and settling it. */
const realStarter = `
import fs from "node:fs";
import { settleClaimedDaemonUpdate, takeDaemonUpdate } from ${JSON.stringify(path.join(process.cwd(), "packages/cli/src/auto-update.ts"))};
const [home, profile, log] = process.argv.slice(2);
void (async () => {
  try {
    if (!takeDaemonUpdate(home, profile)) {
      fs.appendFileSync(log, "skipped " + process.pid + "\\n");
      return;
    }
    const settled = await settleClaimedDaemonUpdate(home, profile, async () => {
      fs.appendFileSync(log, "ran\\n");
      await new Promise((resolve) => setTimeout(resolve, 40));
      return 0;
    });
    fs.appendFileSync(log, (settled ? "took " : "lost ") + process.pid + "\\n");
  } catch (error) {
    fs.appendFileSync(log, "threw " + String(error) + "\\n");
    process.exitCode = 1;
  }
})();
`;

/** The mutation the property must reject: the decision is a pid read once. */
const plantedStarter = `
import fs from "node:fs";
import path from "node:path";
const [home, profile, log] = process.argv.slice(2);
const file = path.join(home, "workflows", profile, "auto-update-daemon");
const claim = file + ".claimed";
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; } };
const owner = () => { try { const text = fs.readFileSync(claim, "utf8").trim(); return text.startsWith("{") ? JSON.parse(text).pid : Number.parseInt(text, 10); } catch { return undefined; } };
const seen = owner();
if (seen !== undefined && !alive(seen)) { try { fs.renameSync(claim, file); } catch { /* the other recovery won the rename */ } }
if (!fs.existsSync(file)) { fs.appendFileSync(log, "skipped " + process.pid + "\\n"); process.exit(0); }
// The read above was the decision; the write below acts on it after a pause.
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3);
fs.writeFileSync(claim, JSON.stringify({ pid: process.pid, stamp: "planted" }));
fs.rmSync(file, { force: true });
fs.appendFileSync(log, "ran\\n");
fs.appendFileSync(log, "took " + process.pid + "\\n");
`;

const TSX = path.join(process.cwd(), "node_modules", ".bin", "tsx");

function starter(script: string, args: readonly string[]): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(TSX, [script, ...args], { stdio: ["ignore", "ignore", "pipe"] });
    child.stderr.resume();
    child.on("close", (code) => resolve(code));
  });
}

interface Machine {
  readonly directory: string;
  readonly home: string;
  readonly log: string;
  readonly due: string;
  readonly claim: string;
  readonly script: string;
}

function machine(): Machine {
  const cache = path.join(process.cwd(), "node_modules", ".cache");
  fs.mkdirSync(cache, { recursive: true });
  const directory = fs.mkdtempSync(path.join(cache, "amy-claim-"));
  fs.writeFileSync(path.join(directory, "package.json"), '{"type":"module"}\n');
  const home = path.join(directory, "amy-home");
  const workflows = path.join(home, "workflows", PROFILE);
  fs.mkdirSync(workflows, { recursive: true });
  const script = path.join(directory, "starter.ts");
  fs.writeFileSync(script, planted ? plantedStarter : realStarter, "utf-8");
  return {
    directory,
    home,
    log: path.join(directory, "ran.log"),
    due: path.join(workflows, "auto-update-daemon"),
    claim: path.join(workflows, "auto-update-daemon.claimed"),
    script,
  };
}

async function starters(one: Machine, count: number): Promise<number> {
  const running = Array.from({ length: count }, () => starter(one.script, [one.home, PROFILE, one.log]));
  const codes = await Promise.all(running);
  expect(codes).toEqual(Array.from({ length: count }, () => 0));
  const log = fs.readFileSync(one.log, "utf-8");
  return log.split("\n").filter((line) => line === "ran").length;
}

describe("a daemon update due once", () => {
  it(FALSIFIER, async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 3 }), async (count) => {
        // One due marker, many starters: one update runs.
        const fresh = machine();
        fs.writeFileSync(fresh.due, "due\n");
        expect(await starters(fresh, count)).toBe(1);

        // A claim whose owner died after it consumed the due: one starter
        // recovers it and runs the update, and nobody runs it beside them.
        const stale = machine();
        fs.writeFileSync(stale.claim, `${JSON.stringify({ pid: 999_999, stamp: "gone" })}\n`);
        expect(await starters(stale, count)).toBe(1);

        // A claim a live process holds: nobody takes it.
        const live = machine();
        fs.writeFileSync(live.due, "due\n");
        fs.writeFileSync(live.claim, `${JSON.stringify({ pid: process.pid, stamp: "here" })}\n`);
        expect(await starters(live, count)).toBe(0);
      }),
      { numRuns: 1 },
    );
  }, 120_000);
});

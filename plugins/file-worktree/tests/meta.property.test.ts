import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

const FALSIFIER = "meta_written_in_place";
const planted = process.env.SF_FALSIFIER === FALSIFIER;
const MANAGER = JSON.stringify(path.join(process.cwd(), "plugins/file-worktree/src/manager.ts"));

/** One writer, in a process of its own, touching a tree it already holds. */
const realWriter = `
import fs from "node:fs";
import { WorktreeManager } from ${MANAGER};
const [root, workflow, workId, repo, rounds] = process.argv.slice(2);
const manager = new WorktreeManager(
  { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  { root, workflow, defaultBranch: "main", workspaceRoot: "", retentionDays: 7, record: () => null, terminalStates: [] },
);
for (let n = 0; n < Number(rounds); n += 1) manager.touch(workId, repo);
`;

/** The mutation the property must reject: the meta rewritten where it lies. */
const plantedWriter = `
import fs from "node:fs";
import path from "node:path";
const [root, workflow, workId, repo, rounds] = process.argv.slice(2);
const file = path.join(root, workflow, ".meta", workId, repo.replace("/", "-") + ".json");
fs.mkdirSync(path.dirname(file), { recursive: true });
for (let n = 0; n < Number(rounds); n += 1) {
  const text = JSON.stringify({ workId, repo, acquiredAt: String(n), updatedAt: String(n) }, null, 2) + "\\n";
  fs.writeFileSync(file, text.slice(0, text.length / 2));
  // The window an in-place write leaves a reader, widened so it is observable.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
  fs.appendFileSync(file, text.slice(text.length / 2));
}
`;

const TSX = path.join(process.cwd(), "node_modules", ".bin", "tsx");

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

describe("a tree's meta read while another process writes it", () => {
  it(FALSIFIER, async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 300, max: 900 }), async (rounds) => {
        const cache = path.join(process.cwd(), "node_modules", ".cache");
        fs.mkdirSync(cache, { recursive: true });
        const directory = fs.mkdtempSync(path.join(cache, "amy-meta-"));
        fs.writeFileSync(path.join(directory, "package.json"), '{"type":"module"}\n');
        const root = path.join(directory, "trees");
        const workflow = "oncall";
        const workId = "W-1";
        const repo = "acme/widgets";
        const tree = path.join(root, workflow, workId, "acme-widgets");
        const file = path.join(root, workflow, ".meta", workId, "acme-widgets.json");
        fs.mkdirSync(tree, { recursive: true });
        // A tree the manager already holds: touching it writes the meta, and
        // no checkout is cut for it.
        fs.writeFileSync(path.join(tree, ".git"), "gitdir: elsewhere\n");
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `${JSON.stringify({ workId, repo, acquiredAt: "0", updatedAt: "0" }, null, 2)}\n`);
        const script = path.join(directory, "run.ts");
        fs.writeFileSync(script, planted ? plantedWriter : realWriter, "utf-8");

        let finished = false;
        const writing = run(script, [root, workflow, workId, repo, String(rounds)]).finally(() => {
          finished = true;
        });
        let torn = 0;
        let reads = 0;
        while (!finished) {
          const text = fs.readFileSync(file, "utf-8");
          reads += 1;
          if (text.trim() === "") torn += 1;
          else {
            try {
              JSON.parse(text);
            } catch {
              torn += 1;
            }
          }
          await new Promise((resolve) => setImmediate(resolve));
        }

        const outcome = await writing;
        expect(outcome.stderr).toBe("");
        expect(outcome.code).toBe(0);
        expect(reads).toBeGreaterThan(0);
        expect(torn).toBe(0);
      }),
      { numRuns: 1 },
    );
  }, 60_000);
});

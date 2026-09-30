import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorktreeManager } from "../src/manager.js";
import { plugin } from "../src/plugin.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function mount(recordsDirectory: string, root: string): WorktreeManager {
  let manager: WorktreeManager | undefined;
  plugin.register({ port: (_kind: string, value: WorktreeManager) => { manager = value; } } as never, {
    config: {
      root,
      workflow: "phase",
      recordsDirectory,
      defaultBranch: "main",
      retentionDays: 7,
    },
    paths: { state: path.join(root, "shared-state") },
    runner: { run: async () => ({ ok: true, stdout: "", stderr: "" }) },
    workflow: () => ({ terminalStates: ["DONE"] }),
  } as never);
  if (!manager) throw new Error("worktree plugin did not mount its port");
  return manager;
}

describe("the file worktree plugin", () => {
  it("reads records from the host-selected phase directory", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-worktree-plugin-"));
    roots.push(root);
    const records = path.join(root, "phase-records");
    fs.mkdirSync(records, { recursive: true });
    fs.writeFileSync(path.join(records, "work-1.json"), JSON.stringify({ state: "DONE" }));
    fs.mkdirSync(path.join(root, "trees", "phase", "work-1", "repo", ".git"), { recursive: true });

    const states = await mount(records, path.join(root, "trees")).states();

    expect(states).toMatchObject([{ workId: "work-1", state: "terminal" }]);
  });
});

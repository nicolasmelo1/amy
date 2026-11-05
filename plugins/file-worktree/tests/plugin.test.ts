import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mount as mountPlugins } from "@amykit/core";
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
      workspaceRoot: root,
      checkouts: {},
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

  it("keeps a called phase's tree with the root record that owns it", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-worktree-plugin-"));
    roots.push(root);
    const records = path.join(root, "project-records");
    const workId = "ROW-1/WORK#1";
    fs.mkdirSync(records, { recursive: true });
    fs.writeFileSync(path.join(records, "ROW-1.json"), JSON.stringify({ state: "DONE" }));
    fs.mkdirSync(path.join(root, "trees", "phase", "ROW-1-WORK-1", "repo", ".git"), { recursive: true });
    fs.mkdirSync(path.join(root, "trees", "phase", ".meta", "ROW-1-WORK-1"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "trees", "phase", ".meta", "ROW-1-WORK-1", "repo.json"),
      JSON.stringify({ workId, repo: "repo", acquiredAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
    );

    const states = await mount(records, path.join(root, "trees")).states();

    expect(states).toMatchObject([{ workId, state: "terminal" }]);
  });

  it("refuses a base map whose value is not a branch name when it mounts", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-worktree-plugin-"));
    roots.push(root);
    const outcome = await mountPlugins(
      [plugin],
      {
        "@amykit/plugin-file-worktree": {
          workflow: "phase",
          workspaceRoot: root,
          baseBranch: { "acme/widgets": 7 },
        },
      },
      {
        runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
        now: () => new Date(),
        paths: { state: root },
      },
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.problems.join("\n")).toContain("`baseBranch` names 7 for `acme/widgets`, which is not a branch name");
    }
  });
});

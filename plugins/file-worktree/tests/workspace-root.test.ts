import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { plugin } from "../src/plugin.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

/** Mounts the plugin with the slice as given, the way any host hands it on. */
function mount(workspaceRoot: string): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-workspace-root-"));
  roots.push(root);
  plugin.register({ port: () => undefined } as never, {
    config: {
      root: path.join(root, "trees"),
      workflow: "phase",
      recordsDirectory: path.join(root, "records"),
      defaultBranch: "main",
      retentionDays: 7,
      workspaceRoot,
      checkouts: {},
    },
    paths: { state: path.join(root, "state") },
    runner: { run: async () => ({ ok: true, stdout: "", stderr: "" }) },
    workflow: () => ({ terminalStates: ["DONE"] }),
  } as never);
}

describe("the workspace root the plugin mounts", () => {
  it.each(["", "   "])("refuses a root that names no directory (%j)", (blank) => {
    expect(() => mount(blank)).toThrow(/workspaceRoot/);
  });
});

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CLI = new URL("../../dist/index.js", import.meta.url).pathname;

function amy(home: string, ...args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { env: { ...process.env, AMY_HOME: home }, encoding: "utf-8" });
}

describe("amy contract --check", () => {
  it("refuses an install whose config cannot be read, rather than certifying the services alone", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-contract-"));
    fs.writeFileSync(path.join(home, "config.yaml"), "workflows: [this is: not: yaml\n");
    try {
      const checked = amy(home, "contract", "--check");
      expect(checked.status).toBe(1);
      expect(checked.stderr).toContain("the contract does not build");
      // And help still comes up on that machine: the fallback is the command line's, not the contract's.
      expect(amy(home, "--help").status).toBe(0);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("refuses an install naming a plugin that will not import, rather than certifying a contract without it", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-contract-"));
    fs.writeFileSync(path.join(home, "config.yaml"), 'workflows:\n  work:\n    workflow: "@acme/workflow-nowhere"\n');
    try {
      const checked = amy(home, "contract", "--check");
      expect(checked.status).toBe(1);
      expect(checked.stderr).toContain("@acme/workflow-nowhere: not installed");
      expect(amy(home, "--help").status).toBe(0);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

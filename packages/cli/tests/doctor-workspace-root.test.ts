import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { diagnose, type DoctorDeps } from "../src/doctor.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { paths } from "../src/paths.js";

describe("the doctor on a workspace root that names nothing", () => {
  let home: string;

  beforeEach(() => {
    home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "amy-doctor-root-")), ".amy");
    fs.mkdirSync(paths(home).base, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(path.dirname(home), { recursive: true, force: true });
  });

  function deps(workspaceRoot: string): DoctorDeps {
    return {
      home,
      cwd: path.dirname(home),
      config: {
        ...DEFAULT_CONFIG,
        plugins: { "@amykit/plugin-file-worktree": { repos: ["acme/widgets"], workspaceRoot } },
      },
      runner: new ScriptedRunner([]),
      env: {},
      now: new Date("2026-11-19T12:00:00.000Z"),
      schemas: {},
      workspacePort: { workspaceRoot, checkouts: {} },
    } as DoctorDeps;
  }

  it.each(["", "   "])("answers with a red check naming the setting, rather than throwing (%j)", async (blank) => {
    const checks = await diagnose(deps(blank));

    const named = checks.filter((check) => !check.ok && `${check.label} ${check.detail}`.includes("workspaceRoot"));
    expect(named.length).toBeGreaterThan(0);
  });
});

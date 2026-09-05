import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HostServices, mount } from "@amykit/core";
import { ScriptedRunner } from "@amykit/test-fixtures";
import type { Tasks } from "@amykit/workflow-errand";
import { plugin } from "../src/plugin.js";

describe("mounting the tasks directory", () => {
  let state: string;

  beforeEach(() => {
    state = fs.mkdtempSync(path.join(os.tmpdir(), "amy-tasks-mount-"));
  });

  afterEach(() => fs.rmSync(state, { recursive: true, force: true }));

  const host = (): HostServices => ({
    runner: new ScriptedRunner([]),
    now: () => new Date("2026-09-05T10:00:00.000Z"),
    paths: { workspace: "/checkouts", state },
  });

  it("mounts the port the errand workflow reads its work from", async () => {
    const outcome = await mount([plugin], {}, host());
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect(outcome.mounted.ports.has("tasks")).toBe(true);
  });

  it("keeps them beside the rest of the state, under the configured name", async () => {
    const outcome = await mount(
      [plugin],
      { "@amykit/plugin-file-tasks": { directory: "errands", repo: "acme/widgets" } },
      host(),
    );
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    (outcome.mounted.ports.get("tasks") as Tasks).add(
      { repo: "acme/widgets", text: "do the thing", source: "ada" },
      new Date("2026-09-05T10:00:00.000Z"),
    );

    expect(fs.readdirSync(path.join(state, "errands"))).toHaveLength(1);
  });

  it("refuses a setting that is not one this plugin has", async () => {
    const outcome = await mount([plugin], { "@amykit/plugin-file-tasks": { dir: "x" } }, host());

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems.join(" ")).toContain("dir");
  });
});

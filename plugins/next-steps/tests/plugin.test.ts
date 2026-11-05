import { describe, it, expect } from "vitest";
import { HostServices, mount } from "@amykit/core";
import { ScriptedRunner, fakeWorkspace } from "@amykit/test-fixtures";
import { NextStepsTracker, plugin } from "../src/index.js";

describe("mounting the next-steps tracker", () => {
  const host = (): HostServices => ({
    runner: new ScriptedRunner([]),
    now: () => new Date("2026-11-02T10:00:00.000Z"),
    paths: { state:  "/state" },
  });

  it("mounts the tracker port, reading the table it was pointed at", async () => {
    const outcome = await mount([fakeWorkspace(), plugin], { "@amykit/plugin-next-steps": { repo: "acme/widgets" } }, host());
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect(outcome.mounted.ports.get("tracker")).toBeInstanceOf(NextStepsTracker);
  });

  it("refuses to mount without the repository the table is in", async () => {
    const outcome = await mount([plugin], {}, host());

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems.join(" ")).toContain("repo");
  });

  it("refuses a number of rows that is not one or more", async () => {
    const outcome = await mount([fakeWorkspace(), plugin], { "@amykit/plugin-next-steps": { repo: "acme/widgets", rows: 0 } }, host());

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems.join(" ")).toContain("rows");
  });

  it("refuses a setting that is not one this plugin has", async () => {
    const outcome = await mount([plugin], { "@amykit/plugin-next-steps": { repo: "acme/widgets", path: "x" } }, host());

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems.join(" ")).toContain("path");
  });
});

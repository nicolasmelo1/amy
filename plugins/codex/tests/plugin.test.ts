import { HostServices, mount } from "@amykit/core";
import { USAGE_COLLECTION } from "@amykit/agent-kit";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { describe, expect, it } from "vitest";
import { plugin } from "../src/plugin.js";

function host(version: string): HostServices {
  return {
    runner: new ScriptedRunner([
      {
        match: (command, args) =>
          command === "codex" && args.join(" ") === "--version",
        result: { stdout: version },
      },
    ]),
    now: () => new Date("2026-11-05T12:00:00.000Z"),
    paths: { state: "/state" },
  };
}

describe("mounting the Codex adapter", () => {
  it("accepts the captured 0.166 app-server protocol", async () => {
    await expect(mount([plugin], {}, host("codex-cli 0.166.4"))).resolves.toMatchObject({
      ok: true,
    });
  });

  it("refuses an incompatible app-server protocol and names its version", async () => {
    const outcome = await mount([plugin], {}, host("codex-cli 0.167.0"));

    expect(outcome).toMatchObject({ ok: false });
    expect(outcome.ok === false && outcome.problems.join(" ")).toContain(
      "codex-cli 0.167.0",
    );
  });

  it("keeps the usage reader available to read-only inspection when Codex cannot boot", async () => {
    const outcome = await mount([plugin], {}, { ...host("missing"), readOnly: true });

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && [...outcome.mounted.contributions.get(USAGE_COLLECTION)!.keys()]).toEqual(["Codex"]);
  });
});

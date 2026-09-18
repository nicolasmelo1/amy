import { describe, expect, it } from "vitest";
import { mount, type HostServices } from "@amykit/core";
import { plugin } from "../src/plugin.js";

const host: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date(),
  paths: { workspace: "/work", state: "/state", checkouts: {} },
};

describe("feature-grooming plugin", () => {
  it("refuses a feature repository without an explicit checkout at boot", async () => {
    const outcome = await mount([plugin], { "@amykit/workflow-feature-grooming": { repos: ["acme/widgets"] } }, host);
    expect(outcome).toMatchObject({ ok: false, problems: [expect.stringContaining("configured checkout for `acme/widgets`")] });
  });
});

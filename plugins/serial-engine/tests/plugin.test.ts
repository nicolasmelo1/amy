import { describe, it, expect } from "vitest";
import { Engine, HostServices, mount } from "@amy/core";
import { plugin } from "../src/plugin.js";

const HOST: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-09-03T12:00:00.000Z"),
  paths: { workspace: "/w", state: "/w/.amy" },
};

const SETTINGS = {
  "@amy/plugin-serial-engine": { repos: ["acme/widgets"], qaStatusName: "In QA" },
};

async function mountAlone(extra: Parameters<typeof mount>[0] = []) {
  const outcome = await mount([plugin, ...extra], SETTINGS, HOST);
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  return outcome.mounted;
}

describe("the serial engine plugin", () => {
  it("mounts an engine and the workflow it drives", async () => {
    const mounted = await mountAlone();

    expect(typeof mounted.engine?.tick).toBe("function");
    expect(mounted.workflow?.name).toBe("ticket-to-qa");
  });

  it("mounts without the ports it will need, and complains only when used", async () => {
    // Deliberate: the ports come from plugins that may be listed after this
    // one, so demanding them at mount would make the config order matter.
    const mounted = await mountAlone();

    await expect((mounted.engine as Engine).tick()).rejects.toThrow(
      /needs the `queue` port, and nothing mounted it/,
    );
  });

  it("names the missing port, not a property of undefined", async () => {
    const withQueue = await mountAlone([
      {
        name: "@amy/plugin-q",
        version: "0.1.0",
        register: (r) => r.queue({} as never),
      },
    ]);

    await expect((withQueue.engine as Engine).tick()).rejects.toThrow(
      /needs the `store` port/,
    );
  });

});

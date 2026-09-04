import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HostServices, mount, unmetNeeds } from "@amy/core";
import { DEFAULT_PLUGINS, load } from "../src/loader.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { pluginSlices } from "../src/slices.js";

const ROSTER = {
  confirmedOn: "2026-09-03",
  reviewers: [{ tracker: "ada@example.test", host: "ada", available: true }],
  qa: { tracker: "grace@example.test", host: "grace", available: true },
};

const CONFIG = {
  ...DEFAULT_CONFIG,
  repos: ["acme/widgets"],
  workingStatusName: "In Progress",
  qaStatusName: "In QA",
  defaultBranch: "dev",
  gate: { "acme/widgets": ["npm test"] },
  notify: { tracker: true, hermes: "slack:ops", inbox: true },
};

/**
 * Mounts the set a fresh install runs with.
 *
 * This is the test that says the ten plugin wrappers actually register what
 * they claim to. A wrapper that mounts nothing passes every unit test in its
 * own package and leaves the machine with no agent.
 */
describe("assembling the built-in set", () => {
  let root: string;
  let host: HostServices;
  let previousKey: string | undefined;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-assemble-"));
    previousKey = process.env.LINEAR_API_KEY;
    process.env.LINEAR_API_KEY = "lin_api_test";
    host = {
      runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
      now: () => new Date("2026-09-03T12:00:00.000Z"),
      paths: { workspace: path.join(root, "checkouts"), state: path.join(root, ".amy") },
    };
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.LINEAR_API_KEY;
    else process.env.LINEAR_API_KEY = previousKey;
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function assemble(config = CONFIG) {
    const loaded = await load(DEFAULT_PLUGINS);
    expect(loaded.problems).toEqual([]);

    const roster = {
      name: "@amy/cli",
      version: "0.1.0",
      register: (r: Parameters<(typeof loaded.plugins)[0]["register"]>[0]) =>
        r.contribute("workflow-data", "roster", { read: () => ROSTER }),
    };

    return mount([...loaded.plugins, roster], pluginSlices(config), host);
  }

  it("assembles without a single problem", async () => {
    const outcome = await assemble();

    expect(outcome.ok).toBe(true);
  });

  it("mounts every port the workflow's actions need", async () => {
    const outcome = await assemble();
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect([...outcome.mounted.ports.keys()].sort()).toEqual([
      "agent",
      "code-host",
      "gate",
      // The notes are mounted in both profiles: this one writes them when it
      // gives up, the other one reads them.
      "notes",
      "notifier",
      "queue",
      "store",
      "tracker",
    ]);
  });

  it("leaves nothing the workflow named unmet", async () => {
    const outcome = await assemble();
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect(unmetNeeds(outcome.mounted, outcome.mounted.workflow!)).toEqual([]);
  });

  it("mounts one workflow, and it is the one that drives a ticket", async () => {
    const outcome = await assemble();

    expect(outcome.ok === true && outcome.mounted.workflow?.name).toBe("ticket-to-qa");
  });

  it("collects a channel from each plugin that has one", async () => {
    const outcome = await assemble();
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect([...outcome.mounted.contributions.get("notify-channel")!.keys()].sort()).toEqual([
      "hermes",
      "inbox",
      "tracker",
    ]);
  });

  it("mounts an engine, which is what advances anything at all", async () => {
    const outcome = await assemble();

    expect(outcome.ok === true && typeof outcome.mounted.engine?.tick).toBe("function");
  });

  it("refuses to mount the tracker without its key, and says which plugin", async () => {
    delete process.env.LINEAR_API_KEY;

    const outcome = await assemble();

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems[0]).toContain(
      "@amy/plugin-linear: failed to mount — LINEAR_API_KEY is not set",
    );
  });

  it("announces down every channel that was contributed", async () => {
    const outcome = await assemble();
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    const notifier = outcome.mounted.ports.get("notifier") as {
      announce: (a: { text: string; workId: string; state: string }) => Promise<void>;
    };

    // The fan-out reads its channels when it announces, not when it mounted,
    // which is the only reason it can see channels listed after it.
    await expect(
      notifier.announce({ text: "hello", workId: "ACME-1", state: "CLARIFYING" }),
    ).resolves.toBeUndefined();
  });
});

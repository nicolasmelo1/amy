import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { plugin as notifyHermes } from "@amy/plugin-notify-hermes";
import { ScriptedRunner, whenArgsInclude } from "@amy/test-fixtures";
import { Check, DoctorDeps, diagnose } from "../src/doctor.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { paths } from "../src/paths.js";

const WORKDAY = new Date("2026-09-03T12:00:00.000Z");

const ROSTER = {
  confirmedOn: "2026-09-03",
  reviewers: [{ tracker: "ada@example.test", host: "ada", available: true }],
  qa: { tracker: "grace@example.test", host: "grace", available: true },
};

const HERMES_LISTING = JSON.stringify({ platforms: { slack: [{ id: "C1", name: "ops" }] } });

function labelled(checks: Check[], fragment: string): Check | undefined {
  return checks.find((check) => check.label.includes(fragment));
}

describe("diagnose", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-doctor-"));
    fs.mkdirSync(paths(root).base, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function deps(overrides: Partial<DoctorDeps> = {}): DoctorDeps {
    return {
      root,
      config: { ...DEFAULT_CONFIG, repos: ["acme/widgets"], gate: { default: ["npm test"] } },
      runner: new ScriptedRunner([
        { match: whenArgsInclude("--list"), result: { stdout: HERMES_LISTING } },
      ]),
      env: { LINEAR_API_KEY: "lin_api_test" },
      now: WORKDAY,
      readRoster: () => ROSTER,
      // What the plugins this install loaded said their settings look like.
      // Taken from the plugin itself, so a schema nobody declares cannot be
      // asserted against here either.
      schemas: { [notifyHermes.name]: notifyHermes.configSchema! },
      ...overrides,
    };
  }

  it("fails when there is no config file", async () => {
    const checks = await diagnose(deps());

    expect(labelled(checks, "config file")?.ok).toBe(false);
  });

  it("passes once the config file exists", async () => {
    fs.writeFileSync(paths(root).config, "repos: [acme/widgets]\n");

    const checks = await diagnose(deps());

    expect(labelled(checks, "config file")?.ok).toBe(true);
  });

  it("fails when no repository is configured", async () => {
    const checks = await diagnose(deps({ config: { ...DEFAULT_CONFIG, repos: [] } }));

    expect(labelled(checks, "repos configured")?.ok).toBe(false);
  });

  it("fails when nothing would vouch for a change", async () => {
    const checks = await diagnose(deps({ config: { ...DEFAULT_CONFIG, gate: {} } }));

    expect(labelled(checks, "gate configured")?.ok).toBe(false);
  });

  it("fails when nothing could reach the operator", async () => {
    const config = {
      ...DEFAULT_CONFIG,
      notify: { tracker: false, hermes: null, inbox: false },
    };

    const checks = await diagnose(deps({ config }));

    expect(labelled(checks, "notification channel")?.ok).toBe(false);
  });

  it("fails a roster confirmed on another day", async () => {
    const checks = await diagnose(
      deps({ readRoster: () => ({ ...ROSTER, confirmedOn: "2026-09-01" }) }),
    );

    const roster = labelled(checks, "roster");
    expect(roster?.ok).toBe(false);
    expect(roster?.detail).toContain("amy roster confirm");
  });

  it("reports a missing roster as the reason, not as a crash", async () => {
    const checks = await diagnose(
      deps({
        readRoster: () => {
          throw new Error("no roster at .amy/roster.yaml");
        },
      }),
    );

    expect(labelled(checks, "roster")?.detail).toContain("no roster at");
  });

  it("fails without the API key", async () => {
    const checks = await diagnose(deps({ env: {} }));

    expect(labelled(checks, "LINEAR_API_KEY")?.ok).toBe(false);
  });

  it("checks the tools it shells out to", async () => {
    const checks = await diagnose(deps());

    for (const tool of ["gh", "claude", "git"]) {
      expect(labelled(checks, `${tool} available`)?.ok).toBe(true);
    }
  });

  it("reports the first line of a tool's complaint", async () => {
    const runner = new ScriptedRunner([
      {
        match: (command) => command === "gh",
        result: { exitCode: 1, stderr: "not logged in\nrun gh auth login" },
      },
      { match: whenArgsInclude("--list"), result: { stdout: HERMES_LISTING } },
    ]);

    const checks = await diagnose(deps({ runner }));

    expect(labelled(checks, "gh available")).toMatchObject({
      ok: false,
      detail: "not logged in",
    });
  });

  it("says nothing about hermes when no channel is configured", async () => {
    const config = { ...DEFAULT_CONFIG, notify: { tracker: true, hermes: null, inbox: true } };

    const checks = await diagnose(deps({ config }));

    expect(labelled(checks, "hermes target")).toBeUndefined();
  });

  it("fails a hermes target hermes does not have", async () => {
    const config = {
      ...DEFAULT_CONFIG,
      notify: { tracker: true, hermes: "slack:#nope", inbox: true },
    };

    const checks = await diagnose(deps({ config }));

    expect(labelled(checks, "hermes target")).toMatchObject({
      ok: false,
      detail: "hermes does not have this target configured",
    });
  });

  it("passes a hermes target hermes does have", async () => {
    const config = {
      ...DEFAULT_CONFIG,
      notify: { tracker: true, hermes: "slack:ops", inbox: true },
    };

    const checks = await diagnose(deps({ config }));

    expect(labelled(checks, "hermes target")?.ok).toBe(true);
  });

  it("says so when hermes answers with something unreadable", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("--list"), result: { stdout: "not json at all" } },
    ]);
    const config = {
      ...DEFAULT_CONFIG,
      notify: { tracker: true, hermes: "slack:ops", inbox: true },
    };

    const checks = await diagnose(deps({ runner, config }));

    expect(labelled(checks, "hermes target")?.detail).toContain("could not read");
  });

  it("fails a repository that is not checked out", async () => {
    const config = { ...DEFAULT_CONFIG, repos: ["acme/widgets"], workspaceRoot: root };

    const checks = await diagnose(deps({ config }));

    expect(labelled(checks, "checkout acme/widgets")?.ok).toBe(false);
  });

  it("passes a repository that is", async () => {
    fs.mkdirSync(path.join(root, "widgets", ".git"), { recursive: true });
    const config = { ...DEFAULT_CONFIG, repos: ["acme/widgets"], workspaceRoot: root };

    const checks = await diagnose(deps({ config }));

    expect(labelled(checks, "checkout acme/widgets")?.ok).toBe(true);
  });

  it("says nothing about plugin settings when none are configured", async () => {
    const checks = await diagnose(deps());

    expect(checks.filter((check) => check.label.startsWith("settings for"))).toEqual([]);
  });

  it("passes a plugin slice that matches what the plugin declared", async () => {
    const config = {
      ...DEFAULT_CONFIG,
      plugins: { "@amy/plugin-notify-hermes": { target: "slack:ops" } },
    };

    const checks = await diagnose(deps({ config }));

    expect(labelled(checks, "settings for @amy/plugin-notify-hermes")?.ok).toBe(true);
  });

  it("fails a plugin slice naming the plugin and the field", async () => {
    const config = {
      ...DEFAULT_CONFIG,
      plugins: { "@amy/plugin-notify-hermes": { targt: "slack:ops" } },
    };

    const checks = await diagnose(deps({ config }));

    const check = labelled(checks, "settings for @amy/plugin-notify-hermes");
    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain("`targt` is not a setting this plugin has");
    expect(check?.detail).toContain("`target` is required");
  });

  it("fails a slice for a plugin nothing mounted", async () => {
    // A setting written for a plugin nobody installed is a setting that will
    // never do anything, which is worth saying out loud.
    const config = { ...DEFAULT_CONFIG, plugins: { "@amy/plugin-imaginary": { a: 1 } } };

    const checks = await diagnose(deps({ config }));

    expect(labelled(checks, "settings for @amy/plugin-imaginary")).toMatchObject({
      ok: false,
      detail: "nothing mounted declares these settings",
    });
  });
});

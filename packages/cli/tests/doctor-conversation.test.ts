import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { Check, DoctorDeps, diagnose } from "../src/doctor.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { paths } from "../src/paths.js";

/**
 * The doctor asks a mounted conversation for its own checks, the way it asks
 * the notification port whether its target is reachable: what a Slack token
 * needs is the adapter's knowledge, not the host's.
 */
describe("diagnose, with a conversation mounted", () => {
  let home: string;

  beforeEach(() => {
    home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "amy-doctor-")), ".amy");
    fs.mkdirSync(paths(home).base, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(path.dirname(home), { recursive: true, force: true });
  });

  function deps(conversationPort?: object): DoctorDeps {
    return {
      home,
      cwd: path.dirname(home),
      config: { ...DEFAULT_CONFIG, repos: [], gate: {} },
      runner: new ScriptedRunner([]),
      env: {},
      now: new Date("2026-09-05T12:00:00.000Z"),
      readRoster: () => ({ confirmedOn: "2026-09-05", reviewers: [], qa: { tracker: "", host: "", available: true } }),
      schemas: {},
      conversationPort,
    };
  }

  const slackish = (checks: () => Promise<Check[]>) => ({ open: () => {}, post: () => {}, replies: () => {}, checks });

  it("reports what the conversation says about itself", async () => {
    const said: Check[] = [
      { label: "slack token", ok: true, detail: "amy in Workshop" },
      { label: "slack scopes", ok: false, detail: "missing files:read" },
    ];

    const checks = await diagnose(deps(slackish(async () => said)));

    expect(checks).toEqual(expect.arrayContaining(said));
  });

  it("reports a conversation that could not be asked, rather than failing the whole doctor", async () => {
    const checks = await diagnose(deps(slackish(async () => { throw new Error("offline"); })));

    expect(checks).toContainEqual({ label: "conversation", ok: false, detail: "offline" });
  });

  it("asks nothing of a conversation that has no checks of its own", async () => {
    const checks = await diagnose(deps({ open: () => {}, post: () => {}, replies: () => {} }));

    expect(checks.some((check) => check.label === "conversation")).toBe(false);
  });
});

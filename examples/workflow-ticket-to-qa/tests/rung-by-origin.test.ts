import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AskContext,
  CommandRunner,
  HostServices,
  Plugin,
  WORKFLOW_RUNTIME,
  Workflow,
  WorkflowRuntime,
  mount,
} from "@amykit/core";
import { fakeHost, fakeTracker, fakeWorkspace } from "@amykit/test-fixtures";
import { plugin } from "./drawn.js";
import { drive } from "./mounted.js";
import { TicketRecord } from "../src/record.js";

/**
 * The rung every implementation is asked on, driven through the mounted
 * workflow from a fresh record: nothing about the climb is seeded, so the rung
 * is what the workflow's own counting earned at the level config.yaml names.
 */

const run = { outcome: "completed", harness: "fake", model: "fake-1", durationMs: 1, costSource: "unknown", output: "" } as const;

/** An agent that implements, approves its own change, and remembers the rung of every implementation. */
function recordingAgent(): { agent: object; rungs: (number | undefined)[] } {
  const rungs: (number | undefined)[] = [];
  return {
    rungs,
    agent: {
      ask: async (_prompt: string, _cwd: string, context?: AskContext) => {
        if (context?.step === "triage") return { text: '{"clear": true}', run };
        if (context?.step === "self-review") return { text: "nothing to stop it\nAPPROVED", run };
        if (context?.step === "implement") rungs.push(context.rung);
        return { text: "done", run };
      },
    },
  };
}

/** A gate that is red on every run, finding what `findings` says for that run. */
function redGate(findings: (run: number) => number, now: () => Date): object {
  let runs = 0;
  return {
    run: async () => {
      runs += 1;
      return { ok: false, output: "checks red", at: now().toISOString(), findings: findings(runs) };
    },
  };
}

/** A git that always has the agent's change to commit, and names a new commit for every one. */
function alwaysChanged(): CommandRunner {
  let commits = 0;
  return {
    run: async (_command, args) => {
      if (args.includes("commit")) commits += 1;
      const sha = commits.toString(16).padStart(40, "0");
      return {
        ok: true,
        exitCode: 0,
        stdout: args.includes("status") ? " M invoice.md\n" : args.includes("rev-parse") ? `${sha}\n` : "",
        stderr: "",
      };
    },
  };
}

function rosterDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-roster-"));
  fs.writeFileSync(
    path.join(directory, "roster.yaml"),
    [
      'confirmedOn: "2026-09-03"',
      "reviewers:",
      "  - { tracker: ada@example.test, host: ada, available: true }",
      "qa: { tracker: grace@example.test, host: grace, available: true }",
      "",
    ].join("\n"),
    "utf-8",
  );
  return directory;
}

async function mountedWith(
  escalation: object,
  ports: { agent: object; gate: object },
  now: () => Date,
): Promise<{ workflow: Workflow; runtime: WorkflowRuntime }> {
  const world: Plugin = {
    name: "@amykit/plugin-world",
    register: (registry) => {
      registry.port("tracker", fakeTracker());
      registry.port("code-host", fakeHost());
      registry.port("agent", ports.agent);
      registry.port("gate", ports.gate);
      registry.port("notifier", { announce: async () => {} });
    },
  };
  const host: HostServices = { runner: alwaysChanged(), now, paths: { state: "/w/.amy", profile: rosterDirectory() } };
  const outcome = await mount([fakeWorkspace(), plugin, world], {
    "@amykit/workflow-ticket-to-qa": { repos: ["acme/widgets"], qaStatusName: "In QA", escalation },
  }, host);
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  const workflow = outcome.mounted.workflow as unknown as Workflow;
  return { workflow, runtime: outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.get(workflow.name) as WorkflowRuntime };
}

async function walk(escalation: object, findings: (run: number) => number): Promise<{ rungs: (number | undefined)[]; end: TicketRecord }> {
  let at = new Date("2026-09-03T12:00:00.000Z").getTime();
  const now = () => new Date((at += 1000));
  const { agent, rungs } = recordingAgent();
  const mounted = await mountedWith(escalation, { agent, gate: redGate(findings, now) }, now);
  const end = await drive(mounted, mounted.runtime.newRecord("PROJ-1239", now()), now, (current) => current.state === "ESCALATED", 120);
  return { rungs, end };
}

describe("a step's rung, earned by the rounds its origin sent back", () => {
  it("asks the gate's level's number of rounds on each rung below a person, and no more, before the owner is asked", async () => {
    // The gate is counted at `patient`, three rounds a rung, on a ladder of a
    // model, a stronger model and a person.
    const { rungs, end } = await walk(
      { scale: { patient: 3, normal: 2, immediate: 1 }, origins: { gate: { level: "patient" } }, rungs: 3 },
      () => 1,
    );

    expect(end.state).toBe("ESCALATED");
    // The first implementation answers the ticket; each one after answers a
    // round the gate sent back. Three rounds on the first rung, then the next
    // round starts one higher; three rounds there spend the ladder.
    expect(rungs.map((rung) => rung ?? 0)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(end.roundsByOrigin?.gate).toBe(6);
  });

});

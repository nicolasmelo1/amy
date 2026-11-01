import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CommandRunner, HostServices, Plugin, WORKFLOW_RUNTIME, WorkRecord, Workflow, WorkflowRuntime, actionsOf, applyPlan, implementationOf, mount, movedBy, runAction } from "@amykit/core";
import { fakeAgent, fakeGate, fakeHost, fakeTracker } from "@amykit/test-fixtures";
import { TicketRecord } from "../src/record.js";
import { plugin } from "./drawn.js";

/**
 * The workflow as the host mounts it, its lanes composed, over stand-in
 * ports; and a drive that looks the way the serial engine does. For the
 * steps that moved into the `checks` lanes, which only exist once mounted.
 */
export async function mountedTicket(
  ports: { tracker?: object; agent?: object; gate?: object; brief?: object; host?: object },
  now: () => Date,
  runner: CommandRunner = alwaysChanged,
): Promise<{ workflow: Workflow; runtime: WorkflowRuntime }> {
  const world: Plugin = {
    name: "@amykit/plugin-world",
    register: (registry) => {
      registry.port("tracker", ports.tracker ?? fakeTracker());
      registry.port("code-host", ports.host ?? fakeHost());
      registry.port("agent", ports.agent ?? fakeAgent());
      registry.port("gate", ports.gate ?? fakeGate());
      registry.port("notifier", { announce: async () => {} });
      if (ports.brief) registry.port("brief", ports.brief);
    },
  };
  const host: HostServices = {
    runner,
    now,
    paths: { workspace: "/w", checkouts: {}, state: "/w/.amy", profile: rosterDirectory() },
  };
  const outcome = await mount([plugin, world], { "@amykit/workflow-ticket-to-qa": { repos: ["acme/widgets"], qaStatusName: "In QA" } }, host);
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  const workflow = outcome.mounted.workflow as unknown as Workflow;
  return { workflow, runtime: outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.get(workflow.name) as WorkflowRuntime };
}

/** A git that always has the agent's change to commit, and a commit to name. */
const alwaysChanged: CommandRunner = {
  run: async (_command, args) => ({
    ok: true,
    exitCode: 0,
    stdout: args.includes("status") ? " M invoice.md\n" : args.includes("rev-parse") ? "c0ffee0000000000000000000000000000000000\n" : "",
    stderr: "",
  }),
};

/** Looks until `until` holds, the record settles, or the looks run out. */
export async function drive(
  { workflow, runtime }: { workflow: Workflow; runtime: WorkflowRuntime },
  record: WorkRecord,
  now: () => Date,
  until: (record: TicketRecord) => boolean,
  looks = 30,
): Promise<TicketRecord> {
  let current = record;
  for (let count = 0; count < looks && !until(current as TicketRecord); count += 1) {
    const observation = await runtime.observe(current);
    const plan = workflow.plan(current, observation, runtime.policy);
    if (plan.kind === "settled") break;
    const outcomes: Record<string, unknown> = {};
    for (const action of actionsOf(plan)) {
      await runAction(implementationOf(runtime, action.type), action, { record: current, observation, outcomes }, () => undefined);
    }
    const at = now();
    current = runtime.apply(applyPlan(current, plan, at, outcomes), plan, outcomes, observation, at, movedBy(current, plan));
  }
  return current as TicketRecord;
}

/** A profile directory holding the roster this workflow reads, for one test. */
function rosterDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-roster-"));
  fs.writeFileSync(
    path.join(directory, "roster.yaml"),
    [
      'confirmedOn: "2026-09-03"',
      "reviewers:",
      "  - { tracker: ada@example.test, host: ada, available: true }",
      "  - { tracker: alan@example.test, host: alan, available: true }",
      "  - { tracker: edsger@example.test, host: edsger, available: true }",
      "qa: { tracker: grace@example.test, host: grace, available: true }",
      "",
    ].join("\n"),
    "utf-8",
  );
  return directory;
}

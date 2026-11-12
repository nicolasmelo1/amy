import { describe, expect, it } from "vitest";
import {
  Plugin,
  WORKFLOW_RUNTIME,
  Workflow,
  WorkflowRuntime,
  actionsOf,
  call,
  defineWorkflow,
  implementationOf,
  mount,
  portReachedBy,
  settled,
  unmetNeeds,
  withDiagram,
} from "@amykit/core";
import { decide } from "../src/decide.js";
import { ProveWorld, prove } from "./world.js";

/** What the serial engine reads to tell an action that spends the agent from one that does not. */
const reached = (runtime: WorkflowRuntime, action: string) => portReachedBy(implementationOf(runtime, action));

/** A project whose PROVE phase is the proving plugin, the way a project's `prove/` calls it. */
const project: Plugin = withDiagram(defineWorkflow({
  name: "project",
  configSchema: {},
  policy: {},
  needs: {},
  calls: { PROVE: call(prove) },
  decide: { DONE: () => settled("done") },
  record: () => ({}),
  observe: async () => ({}),
  actions: {},
}), "stateDiagram-v2\n[*] --> PROVE\nPROVE --> DONE: PROVEN\nPROVE --> DONE: refused\nDONE --> [*]\nclass PROVE call\n");

describe("a proof's agent step and the budget", () => {
  it("plans an agent step as `run-agent-step`, and a deterministic or wait-until step as `run-step`", () => {
    const scenario = {
      name: "s", resources: [], fixtures: [], assertions: [],
      steps: [
        { id: "open", kind: "deterministic", operation: "bank.open", input: {} },
        { id: "look", kind: "agent", prompt: "find the refund" },
      ],
    };
    const policy = { leaseTtlMs: 1, seatRetryMs: 1, askEveryMs: 1, fixtureDeadlineMs: 1, resources: {}, fixtures: {} };
    const observation = { unit: "TBO-1", problems: [], briefRevision: 1, lost: [], now: "2026-09-03T12:00:00.000Z" };
    const running = (results: Record<string, unknown>) =>
      ({ id: "TBO-1", state: "RUNNING", updatedAt: "", attempts: {}, history: [], scenario, prepared: true, held: [], results }) as never;

    expect(actionsOf(decide.RUNNING!(running({}), observation as never, policy as never)).map((one) => one.type)).toEqual(["run-step"]);
    expect(actionsOf(decide.RUNNING!(running({ open: { status: "done", output: {} } }), observation as never, policy as never)).map((one) => one.type)).toEqual(["run-agent-step"]);
  });


  it("spends the agent standing alone: an agent step reaches the agent port, and a deterministic step or the bookkeeping does not", async () => {
    const { runtime } = await new ProveWorld({}, {}).mounted();

    expect(reached(runtime, "run-agent-step")).toBe("agent");
    expect(["run-step", "lease", "renew", "prepare", "ask", "finish", "give-up"].map((action) => reached(runtime, action))).not.toContain("agent");
  });

  it("spends the agent called as a phase: the project's composed agent step still reaches it, its deterministic one does not", async () => {
    const world = new ProveWorld({}, {});
    const outcome = await mount([project, ...world.ports()], {}, world.host());
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    const workflow = outcome.mounted.workflow as unknown as Workflow;
    const runtime = outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.get(workflow.name) as WorkflowRuntime;

    expect(reached(runtime, "run-agent-step")).toBe("agent");
    expect(reached(runtime, "run-step")).not.toBe("agent");
    expect(unmetNeeds(outcome.mounted, outcome.mounted.workflow!)).toEqual([]);
  });

  it("still boots with no agent mounted, since a proof of deterministic steps needs none", async () => {
    const world = new ProveWorld({}, {});
    const outcome = await mount([prove, ...world.ports().filter((one) => one.name !== "fake-agent")], { [prove.name]: {} }, world.host());
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    expect(outcome.mounted.ports.has("agent")).toBe(false);
    expect(unmetNeeds(outcome.mounted, outcome.mounted.workflow!)).toEqual([]);
  });
});

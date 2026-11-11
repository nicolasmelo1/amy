import { describe, expect, it } from "vitest";
import {
  Plugin,
  WORKFLOW_RUNTIME,
  Workflow,
  WorkflowRuntime,
  call,
  defineWorkflow,
  implementationOf,
  mount,
  portReachedBy,
  settled,
  unmetNeeds,
  withDiagram,
} from "@amykit/core";
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
  it("spends the agent standing alone: `run-step` reaches the agent port, and the bookkeeping steps do not", async () => {
    const { runtime } = await new ProveWorld({}, {}).mounted();

    expect(reached(runtime, "run-step")).toBe("agent");
    expect(["lease", "renew", "prepare", "ask", "finish", "give-up"].map((action) => reached(runtime, action))).not.toContain("agent");
  });

  it("spends the agent called as a phase: the project's composed `run-step` still reaches it", async () => {
    const world = new ProveWorld({}, {});
    const outcome = await mount([project, ...world.ports()], {}, world.host());
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    const workflow = outcome.mounted.workflow as unknown as Workflow;
    const runtime = outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.get(workflow.name) as WorkflowRuntime;

    expect(reached(runtime, "run-step")).toBe("agent");
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

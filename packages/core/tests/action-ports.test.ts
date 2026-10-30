import { describe, expect, it } from "vitest";
import {
  ActionHandler,
  Announcement,
  ConfigSchema,
  Event,
  EventLog,
  Harness,
  HarnessReply,
  HostServices,
  Notifier,
  Plugin,
  WorkRecord,
  WorkflowRuntime,
  WORKFLOW_RUNTIME,
  defineWorkflow,
  mount,
  port,
  withDiagram,
} from "../src/index.js";

const NOW = new Date("2026-10-30T12:00:00.000Z");

function logged(): EventLog & { lines: Event[] } {
  const lines: Event[] = [];
  return { lines, append: (event) => void lines.push(event), read: () => lines } as EventLog & { lines: Event[] };
}

const REPLY: HarnessReply = {
  text: "done",
  run: {
    outcome: "completed",
    harness: "fixture",
    model: "small",
    tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0.01,
    costSource: "reported",
    durationMs: 1200,
    output: "done",
  },
};

class FixtureHarness implements Harness {
  readonly name = "fixture";
  readonly #label = "a fixture";
  constructor(private readonly reply: () => Promise<HarnessReply>) {}
  /** An accessor over a private field, which only finds it with the instance as `this`. */
  get label(): string {
    return this.#label;
  }
  ask(): Promise<HarnessReply> {
    return this.reply();
  }
}

const schema = { policy: { type: "record", description: "workflow policy", default: {} } } satisfies ConfigSchema;
const needs = { agent: port<Harness>(), notifier: port<Notifier>() };
const diagram = `stateDiagram-v2
    [*] --> WORKING
    WORKING --> [*]
`;

const seen: string[] = [];

/** One workflow whose actions only call what they were handed. */
const declared = withDiagram(defineWorkflow({
  name: "attended",
  configSchema: schema,
  policy: {},
  needs,
  record: () => ({}),
  decide: { WORKING: () => ({ kind: "settled", why: "done" }) },
  observe: async () => ({}),
  actions: {
    ask: async ({ ports }) => void (await ports.agent.ask("do it", "/work")),
    say: async ({ announce }) => announce("hello"),
    tell: async ({ ports }, work) => {
      await ports.notifier.announce({ text: "hello", workId: work.record.id, state: work.record.state });
    },
    look: async ({ ports }) => void seen.push(`${ports.agent.name}: ${(ports.agent as FixtureHarness).label}`),
  },
}), diagram);

async function runtimeWith(agent: Harness, notifier: Notifier, log: EventLog): Promise<WorkflowRuntime> {
  const ports: Plugin = {
    name: "ports",
    register: (registry) => {
      registry.port("agent", agent);
      registry.port("notifier", notifier);
    },
  };
  const host: HostServices = {
    runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
    now: () => NOW,
    paths: { workspace: "/work", checkouts: {}, state: "/state" },
    log,
  };
  const outcome = await mount([declared, ports], {}, host);
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  return outcome.mounted.contributions.get(WORKFLOW_RUNTIME)?.get("attended") as WorkflowRuntime;
}

const work = (record: WorkRecord) => ({ record, observation: {}, outcomes: {} });
const record = { id: "W-1", state: "WORKING", updatedAt: NOW.toISOString(), attempts: {}, history: [] } as WorkRecord;
/** The action a workflow declared as a function, which every one here is. */
const handler = (runtime: WorkflowRuntime, name: string) => runtime.actions[name] as ActionHandler;
const quiet: Notifier = { announce: async () => undefined };
const failing: Notifier = { announce: async (_: Announcement) => { throw new Error("no channel"); } };

describe("the ports an action is handed", () => {
  it("write down what every agent run cost, against the work and the state it ran in", async () => {
    const log = logged();
    const runtime = await runtimeWith(new FixtureHarness(async () => REPLY), quiet, log);

    await handler(runtime, "ask")({ type: "ask" }, work(record));

    expect(log.lines).toEqual([{
      at: NOW.toISOString(),
      kind: "agent.run",
      workId: "W-1",
      state: "WORKING",
      detail: {
        harness: "fixture",
        model: "small",
        outcome: "completed",
        durationMs: 1200,
        costSource: "reported",
        costUsd: 0.01,
        tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
      },
    }]);
  });

  it("still fail the action when the agent fails, and write nothing it did not spend", async () => {
    const log = logged();
    const runtime = await runtimeWith(new FixtureHarness(async () => { throw new Error("claude went away"); }), quiet, log);

    await expect(handler(runtime, "ask")({ type: "ask" }, work(record))).rejects.toThrow("claude went away");
    expect(log.lines).toEqual([]);
  });

  it("let an announcement the action chose to make be lost without costing the work a move, and say so", async () => {
    const log = logged();
    const runtime = await runtimeWith(new FixtureHarness(async () => REPLY), failing, log);

    await expect(handler(runtime, "say")({ type: "say" }, work(record))).resolves.toBeUndefined();
    expect(log.lines).toEqual([{
      at: NOW.toISOString(),
      kind: "notify.failed",
      workId: "W-1",
      state: "WORKING",
      detail: { error: "no channel", text: "hello" },
    }]);
  });

  it("leave the notifier strict, so a message the work depends on fails the action when nobody heard it", async () => {
    const log = logged();
    const runtime = await runtimeWith(new FixtureHarness(async () => REPLY), failing, log);

    await expect(handler(runtime, "tell")({ type: "tell" }, work(record))).rejects.toThrow("no channel");
    expect(log.lines).toEqual([]);
  });

  it("keep every other member of a port built as a class, accessors over private fields included", async () => {
    const runtime = await runtimeWith(new FixtureHarness(async () => REPLY), quiet, logged());
    seen.length = 0;

    await handler(runtime, "look")({ type: "look" }, work(record));

    expect(seen).toEqual(["fixture: a fixture"]);
  });
});

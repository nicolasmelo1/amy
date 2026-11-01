import { describe, it, expect, vi } from "vitest";
import {
  ActionContext,
  ActionHandler,
  AgentRun,
  AskContext,
  lendCheckouts,
  Harness,
  HarnessReply,
  Notifier,
  Store,
} from "@amykit/core";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { DEFAULT_POLICY, Observation } from "../src/observation.js";
import { PlanRecord } from "../src/record.js";
import { newRecord } from "./drawn.js";
import { PlanState } from "../src/decide.js";
import { Note, Notes } from "../src/ports/Notes.js";
import { PlanCheck } from "../src/ports/PlanCheck.js";
import { planRuntime } from "../src/actions.js";

/** The handler this runtime declared for one action, as the handler it is. */
function handler(runtime: ReturnType<typeof planRuntime>, name: string): ActionHandler<PlanRecord, Observation> {
  return runtime.actions[name] as ActionHandler<PlanRecord, Observation>;
}

const NOW = new Date("2026-09-04T20:00:00.000Z");

const NOTE: Note = {
  id: "note-1",
  repo: "acme/widgets",
  text: "the gate output is truncated before the agent ever sees it",
  source: "a tick that failed in CHECKED",
  writtenAt: "2026-09-04T19:00:00.000Z",
};

const COMPLETED: AgentRun = {
  outcome: "completed",
  harness: "claude",
  model: "sonnet",
  durationMs: 1200,
  costSource: "reported",
  costUsd: 0.4,
  output: "wrote the plan",
};

function fakeNotes(notes: Note[] = [NOTE]): Notes {
  return {
    all: () => [...notes],
    get: (id) => notes.find((note) => note.id === id) ?? null,
    write: () => {
      throw new Error("this workflow never writes a note");
    },
  };
}

function fakeStore(records: PlanRecord[] = []): Store<PlanRecord> {
  return {
    all: () => [...records],
    load: (id) => records.find((r) => r.id === id) ?? null,
    save: () => undefined,
  };
}

/** Records what it was asked and by whom, which is what these tests read. */
function fakeAgent(reply: Partial<HarnessReply> = {}) {
  const asked: { prompt: string; cwd: string; context?: AskContext }[] = [];

  const agent: Harness = {
    name: "relay",
    ask: async (prompt, cwd, context) => {
      asked.push({ prompt, cwd, context });
      return { text: "done", run: COMPLETED, ...reply };
    },
  };

  return { agent, asked };
}

function build(options: {
  notes?: Notes;
  store?: Store<PlanRecord>;
  agent?: Harness;
  check?: PlanCheck;
  notifier?: Notifier;
  runner?: ScriptedRunner;
  repos?: string[];
} = {}) {
  const runner = options.runner ?? new ScriptedRunner([]);

  return planRuntime({
    notes: options.notes ?? fakeNotes(),
    agent: options.agent ?? fakeAgent().agent,
    check: options.check ?? { check: async () => ({ ok: true, output: "ok", at: "now" }) },
    notifier: options.notifier ?? { announce: async () => undefined },
    records: options.store ?? fakeStore(),
    git: lendCheckouts(runner, { workspaceRoot: "/checkouts", defaultBranch: "main" }).git,
    layout: { workspaceRoot: "/checkouts", defaultBranch: "main" },
    now: () => NOW,
    config: { repos: options.repos ?? ["acme/widgets"] },
    policy: DEFAULT_POLICY,
  });
}

function record(state: PlanState, overrides: Partial<PlanRecord> = {}): PlanRecord {
  return { ...newRecord(NOTE.id, NOW), state, ...overrides };
}

function context(
  current: PlanRecord,
  observation: Observation,
): ActionContext<PlanRecord, Observation> {
  return { record: current, observation, outcomes: {} };
}

async function observed(runtime: ReturnType<typeof build>, current = record("NOTED")) {
  return runtime.observe(current);
}

describe("finding work", () => {
  it("finds every note that has been written down", async () => {
    const handwritten = { ...NOTE, source: "somebody at a keyboard" };
    const runtime = build({ notes: fakeNotes([handwritten, { ...handwritten, id: "note-2" }]) });

    expect(await runtime.found()).toEqual(["note-1", "note-2"]);
  });

  it("leaves the note it wrote about its own failure for a person to read", async () => {
    const runtime = build({ notes: fakeNotes([NOTE]) });

    expect(await runtime.found()).toEqual([]);
  });

  it("finds nothing when nobody has written anything down", async () => {
    expect(await build({ notes: fakeNotes([]) }).found()).toEqual([]);
  });
});

describe("looking at the world", () => {
  it("resolves the work against the notes, and against nothing else", async () => {
    // The whole point of this workflow: no tracker is consulted, so a piece of
    // work exists because somebody wrote it down and for no other reason.
    expect((await observed(build())).note).toEqual(NOTE);
  });

  it("fails by name when the note has been taken away", async () => {
    const runtime = build({ notes: fakeNotes([]) });

    await expect(observed(runtime)).rejects.toThrow(
      "the note note-1 is not in the notes directory any more",
    );
  });

  it("says a note is writable when it names a repository this install writes into", async () => {
    expect((await observed(build())).writable).toBe(true);
  });

  it("says it is not when the note is about a fourth repository", async () => {
    const runtime = build({ repos: ["acme/other"] });

    expect((await observed(runtime)).writable).toBe(false);
  });

  it("counts plans in flight for the same repository", async () => {
    const store = fakeStore([
      record("DRAFTED", { id: "note-2", repo: "acme/widgets" }),
      record("PR_OPEN", { id: "note-3", repo: "acme/widgets" }),
      record("DONE", { id: "note-4", repo: "acme/widgets" }),
      record("DRAFTED", { id: "note-5", repo: "acme/other" }),
    ]);

    expect((await observed(build({ store }))).plansInFlight).toBe(2);
  });

  it("does not count the note it is looking at", async () => {
    const store = fakeStore([record("DRAFTED", { id: "note-1", repo: "acme/widgets" })]);

    expect((await observed(build({ store }))).plansInFlight).toBe(0);
  });

});

describe("drafting", () => {
  it("asks the agent through the port the ticket workflow asks for an implementation", async () => {
    const { agent, asked } = fakeAgent();
    const runtime = build({ agent });
    const current = record("DRAFTED");
    const ctx = context(current, await observed(runtime, current));

    await handler(runtime, "draft-plan")({ type: "draft-plan" }, ctx);

    expect(asked).toHaveLength(1);
  });

  it("asks in its own words, and names the step so a skill can answer for it", async () => {
    const { agent, asked } = fakeAgent();
    const runtime = build({ agent });
    const current = record("DRAFTED");
    const ctx = context(current, await observed(runtime, current));

    await handler(runtime, "draft-plan")({ type: "draft-plan" }, ctx);

    expect(asked[0]?.context).toEqual({ workId: "note-1", step: "draft-plan" });
    expect(asked[0]?.prompt).toContain("the gate output is truncated");
    expect(asked[0]?.prompt).toContain("plans/next-steps.md");
  });

  it("works in the checkout of the repository the note is about", async () => {
    const { agent, asked } = fakeAgent();
    const runtime = build({ agent });
    const current = record("DRAFTED");
    const ctx = context(current, await observed(runtime, current));

    await handler(runtime, "draft-plan")({ type: "draft-plan" }, ctx);

    expect(asked[0]?.cwd).toBe("/checkouts/widgets");
  });

  it("hands the finding to the agent when the check refused the last draft", async () => {
    const { agent, asked } = fakeAgent();
    const runtime = build({ agent });
    const current = record("DRAFTED");
    const ctx = context(current, await observed(runtime, current));

    await handler(runtime, "draft-plan")(
      { type: "draft-plan", finding: "L4.PLAN_DECLARES_EXIT_CONDITION" },
      ctx,
    );

    expect(asked[0]?.prompt).toContain("L4.PLAN_DECLARES_EXIT_CONDITION");
  });

  it("cuts the plan's branch from the default branch on the first draft", async () => {
    // `rev-parse --verify` failing is what "the branch is not on the remote
    // yet" looks like, which is every first draft.
    const runner = new ScriptedRunner([
      { match: (_c, args) => args.includes("--verify"), result: { ok: false, exitCode: 1 } },
    ]);
    const runtime = build({ runner });
    const current = record("DRAFTED");
    const ctx = context(current, await observed(runtime, current));

    await handler(runtime, "draft-plan")({ type: "draft-plan" }, ctx);

    expect(runner.callsTo("git").map((call) => call.args.join(" "))).toContain(
      "checkout -b amy/plan-the-gate-output-is-truncated-before-the-agent origin/main",
    );
  });

  it("counts a run that wrote nothing as a failure, not as a plan", async () => {
    // `git status --porcelain` answering empty means the agent changed no
    // file. A draft that is not on the remote is not something a pull request
    // can be opened against.
    const runner = new ScriptedRunner([
      { match: (_c, args) => args.includes("--porcelain"), result: { stdout: "" } },
    ]);
    const runtime = build({ runner });
    const current = record("DRAFTED");
    const ctx = context(current, await observed(runtime, current));

    await handler(runtime, "draft-plan")({ type: "draft-plan" }, ctx);

    expect(ctx.outcomes.draft).toMatchObject({ ok: false });
  });

  it("counts a run that did not complete as a failure, without pushing", async () => {
    const { agent } = fakeAgent({ run: { ...COMPLETED, outcome: "rate-limited" } });
    const runner = new ScriptedRunner([]);
    const runtime = build({ agent, runner });
    const current = record("DRAFTED");
    const ctx = context(current, await observed(runtime, current));

    await handler(runtime, "draft-plan")({ type: "draft-plan" }, ctx);

    expect(ctx.outcomes.draft).toMatchObject({ ok: false });
    expect(runner.callsTo("git").map((c) => c.args[0])).not.toContain("push");
  });
});

describe("checking", () => {
  it("runs the check in the repository the note is about", async () => {
    const check: PlanCheck = { check: vi.fn().mockResolvedValue({ ok: true, output: "", at: "" }) };
    const runtime = build({ check });
    const current = record("CHECKED");
    const ctx = context(current, await observed(runtime, current));

    await handler(runtime, "check-plan")({ type: "check-plan" }, ctx);

    expect(check.check).toHaveBeenCalledWith("acme/widgets", "note-1");
  });

  it("keeps what the check said, verbatim, because it becomes the finding", async () => {
    const check: PlanCheck = {
      check: async () => ({ ok: false, output: "L4.PLAN_DECLARES_EXIT_CONDITION", at: "now" }),
    };
    const runtime = build({ check });
    const current = record("CHECKED");
    const ctx = context(current, await observed(runtime, current));

    await handler(runtime, "check-plan")({ type: "check-plan" }, ctx);

    expect(ctx.outcomes.check).toEqual({
      ok: false,
      output: "L4.PLAN_DECLARES_EXIT_CONDITION",
      at: "now",
    });
  });
});

// The pull request is opened by the workflow `PR_OPEN` calls. What this one
// still owns is what it is opened with, worked out on the move that calls it.
describe("what the pull request is opened with", () => {
  async function opening(moved: { from: PlanState; to: PlanState } | null) {
    const runtime = build();
    const current = record(moved?.to ?? "CHECKED");
    const plan = moved ? { kind: "advance" as const, to: moved.to, effects: [], why: "" } : { kind: "act" as const, effects: [], why: "" };
    return runtime.apply(current, plan, {}, await observed(runtime, current), NOW, moved).opening;
  }

  it("is the repository the note is about, the plan's branch and the base it opens against", async () => {
    expect(await opening({ from: "CHECKED", to: "PR_OPEN" })).toMatchObject({
      repo: "acme/widgets",
      branch: "amy/plan-the-gate-output-is-truncated-before-the-agent",
      base: "main",
    });
  });

  it("names the friction it came from in the body", async () => {
    const body = (await opening({ from: "CHECKED", to: "PR_OPEN" }))?.body;

    expect(body).toContain("the gate output is truncated");
    expect(body).toContain("a tick that failed in CHECKED");
  });

  it("is worked out only on the move that makes the call", async () => {
    expect(await opening(null)).toBeUndefined();
  });
});

describe("folding what happened back in", () => {
  it("copies the repository off the note, so the ceiling can be counted", async () => {
    const runtime = build();
    const current = record("NOTED");
    const observation = await observed(runtime, current);

    const next = runtime.apply(
      current,
      { kind: "advance", to: "DRAFTED", effects: [], why: "" },
      {},
      observation,
      NOW,
      { from: "NOTED", to: "DRAFTED" },
    );

    expect(next.repo).toBe("acme/widgets");
    expect(next.slug).toBe("the-gate-output-is-truncated-before-the-agent");
  });

  it("keeps what an action produced", async () => {
    const runtime = build();
    const current = record("CHECKED");
    const observation = await observed(runtime, current);

    const next = runtime.apply(
      current,
      { kind: "act", effects: [], why: "" },
      { check: { ok: false, output: "red", at: "now" } },
      observation,
      NOW,
      null,
    );

    expect(next.lastCheck).toEqual({ ok: false, output: "red", at: "now" });
  });
});

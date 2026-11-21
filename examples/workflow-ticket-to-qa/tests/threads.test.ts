import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Conversation, Plugin, ThreadRef, WORKFLOW_RUNTIME, WorkflowRuntime, applyPlan, mount, movedBy } from "@amykit/core";
import { fakeAgent, fakeGate, fakeHost, fakeTracker, fakeWorkspace, mountTicketToQa, observation, policy, pullRequest, record, thread, ticket, ticketWorkerDeps } from "@amykit/test-fixtures";
import { plan } from "../src/machine.js";
import { Observation } from "../src/observation.js";
import { TicketRecord } from "../src/record.js";
import { drive, mountedTicket } from "./mounted.js";
import { actionsFor } from "../src/actions.js";
import { newRecord, plugin } from "./drawn.js";

const NOW = new Date("2026-09-03T12:00:00.000Z");
const UNIT = ticket().id;
const CALLED = `${UNIT}/WORK#1`;

/** A conversation that keeps every thread it was asked to open, and what was asked of it. */
function threads(): Conversation & { opened: string[]; asked: string[]; held: Map<string, ThreadRef> } {
  const held = new Map<string, ThreadRef>();
  const opened: string[] = [];
  const asked: string[] = [];
  return {
    held, opened, asked,
    known: async (workId) => {
      asked.push(workId);
      return held.get(workId);
    },
    open: async (workId, title) => {
      opened.push(`${workId}: ${title}`);
      const thread = held.get(workId) ?? { id: `thread-${workId}` };
      held.set(workId, thread);
      return thread;
    },
    post: async () => "message",
    replies: async () => [],
  };
}

async function mounted(conversation: Conversation): Promise<WorkflowRuntime> {
  const world: Plugin = {
    name: "@amykit/plugin-world",
    register: (registry) => {
      registry.port("tracker", fakeTracker({ get: async (id) => (id === UNIT ? ticket() : null) }));
      registry.port("code-host", fakeHost());
      registry.port("agent", fakeAgent());
      registry.port("gate", fakeGate());
      registry.port("notifier", { announce: async () => {} });
      registry.port("conversation", conversation);
    },
  };
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "amy-threads-"));
  fs.writeFileSync(path.join(profile, "roster.yaml"), 'confirmedOn: "2026-09-03"\nreviewers:\n  - { tracker: ada@example.test, host: ada, available: true }\nqa: { tracker: grace@example.test, host: grace, available: true }\n');
  const outcome = await mount([fakeWorkspace(), plugin, world], {
    "@amykit/workflow-ticket-to-qa": {
      repos: ["acme/widgets"],
      qaStatusName: "In QA",
      // The levels an escalation is counted at are settings with no default.
      escalation: { scale: { patient: 3, normal: 2, immediate: 1 } },
    },
  }, {
    runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
    now: () => NOW,
    paths: { state: profile, profile },
  });
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  const workflow = outcome.mounted.workflow!;
  return outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.get(workflow.name) as WorkflowRuntime;
}

describe("a called ticket's thread", () => {
  it("is read without being opened: a look waiting on an answer asks for the unit's thread and creates none", async () => {
    const conversation = threads();
    const runtime = await mounted(conversation);
    const waiting = {
      ...newRecord(CALLED, NOW),
      state: "CLARIFYING",
      triage: { clear: false, questions: ["Which invoice?"], askedQuestions: ["Which invoice?"], at: NOW.toISOString() },
    };

    const observation = await runtime.observe(waiting) as { ticket: { id: string }; conversation: unknown[] };

    expect(observation.ticket.id).toBe(UNIT);
    expect(observation.conversation).toEqual([]);
    expect(conversation.asked).toEqual([UNIT]);
    expect(conversation.opened).toEqual([]);
  });

  it("is the unit's, titled by the ticket, when the called phase asks its question", async () => {
    const conversation = threads();

    await actionsFor(policy)["ask-question"]!({
      ports: { conversation, tracker: {}, brief: undefined },
      ctx: { now: () => NOW },
      announce: async () => {},
    } as never, {
      record: { id: CALLED },
      observation: { ticket: ticket() },
      outcomes: {},
    } as never, { type: "ask-question", questions: ["Which invoice?"] });

    expect(conversation.opened).toEqual([`${UNIT}: ${ticket().title}`]);
    expect(await conversation.known(UNIT)).toEqual({ id: `thread-${UNIT}` });
  });
});

/** A git standing in for the checkouts that remembers every call, and commits always find a change. */
function recordingGit(log: string[]) {
  const tree = (_repo: string, workId?: string) => `/tmp/amy-fixture/${workId ?? "work"}`;
  return {
    pathFor: tree,
    acquire: async (repo: string, workId: string) => tree(repo, workId),
    prepareBranch: vi.fn(async () => { log.push("prepare"); }),
    commit: vi.fn(async () => { log.push("commit"); return true; }),
    push: vi.fn(async () => { log.push("push"); }),
    commitAndPush: vi.fn(async () => { log.push("commit"); log.push("push"); return true; }),
    headSha: async () => "0".repeat(40),
  };
}

describe("where a change reaches the remote", () => {
  it("is never the implementing step: it commits and does not push", async () => {
    const log: string[] = [];
    const git = recordingGit(log);
    const runtime = await mountTicketToQa({ git: git as never, now: () => NOW });

    await (runtime.actions["implement"] as (e: unknown, c: unknown) => Promise<void>)(
      { type: "implement" },
      { record: record("IMPLEMENTING"), observation: observation(), outcomes: {} },
    );

    expect(log).toContain("commit");
    expect(log).not.toContain("push");
  });

  it("is publishing, after the gate has run on the commit, once per round", async () => {
    const log: string[] = [];
    const runner = {
      run: async (_command: string, args: readonly string[]) => {
        if (args.includes("push")) log.push("push");
        return {
          ok: true,
          exitCode: 0,
          stdout: args.includes("status") ? " M invoice.md\n" : args.includes("rev-parse") ? "c0ffee0000000000000000000000000000000000\n" : "",
          stderr: "",
        };
      },
    };
    const gate = { run: async () => { log.push("gate"); return { ok: true, output: "", at: new Date().toISOString(), findings: 0 }; } };
    let at = NOW.getTime();
    const now = () => new Date((at += 1000));
    const mounted = await mountedTicket({ gate }, now, runner);

    await drive(mounted, mounted.runtime.newRecord(UNIT, now()), now, (current) => current.state === "COPILOT_WAIT" || current.state === "REVIEWER_ASSIGNED");

    expect(log.filter((one) => one === "push")).toHaveLength(1);
    expect(log.indexOf("push")).toBeGreaterThan(log.indexOf("gate"));
  });

  it("pushes nothing in a round the gate refuses", async () => {
    const log: string[] = [];
    const runner = {
      run: async (_command: string, args: readonly string[]) => {
        if (args.includes("push")) log.push("push");
        return {
          ok: true,
          exitCode: 0,
          stdout: args.includes("status") ? " M invoice.md\n" : args.includes("rev-parse") ? "c0ffee0000000000000000000000000000000000\n" : "",
          stderr: "",
        };
      },
    };
    const gate = { run: async () => ({ ok: false, output: "typecheck failed", at: new Date().toISOString(), findings: 1 }) };
    let at = NOW.getTime();
    const now = () => new Date((at += 1000));
    const mounted = await mountedTicket({ gate }, now, runner);

    await drive(mounted, mounted.runtime.newRecord(UNIT, now()), now, (current) => current.state === "IMPLEMENTING" && current.lastGate !== undefined);

    expect(log).not.toContain("push");
  });
});

describe("publishing a change the review sent back", () => {
  const green = (r: TicketRecord): TicketRecord => ({
    ...r,
    lastImplementation: { ok: true, output: "", at: "2026-09-03T11:00:00.000Z" },
    lastGate: { ok: true, output: "", at: "2026-09-03T11:05:00.000Z" },
    lastSelfReview: { ok: true, output: "", at: "2026-09-03T11:05:00.000Z", verdict: "APPROVED" },
    lanes: { GATE: { call: `${UNIT}/GATE#2`, end: "GREEN" }, SELF_REVIEW: { call: `${UNIT}/SELF_REVIEW#2`, end: "APPROVED" } },
  });

  /** Looks from the verdict until the work waits on a reviewer, collecting every effect planned. */
  async function effectsFromVerdict(start: TicketRecord, pr: ReturnType<typeof pullRequest>) {
    const runtime = (await ticketWorkerDeps({ now: () => NOW })).runtime as unknown as WorkflowRuntime<TicketRecord, Observation>;
    const seen = observation({ pullRequest: pr });
    const effects: { type: string; [key: string]: unknown }[] = [];
    let current = start;
    for (let count = 0; count < 6 && current.state !== "HUMAN_REVIEW"; count += 1) {
      const decided = plan(current, seen, policy);
      if (decided.kind === "settled" || decided.kind === "wait") break;
      effects.push(...(decided.effects as { type: string }[]));
      current = runtime.apply(applyPlan(current, decided, NOW, {}), decided, {}, seen, NOW, movedBy(current, decided));
    }
    return effects;
  }

  const takenUp = (r: TicketRecord): TicketRecord => ({
    ...r,
    reviewer: "ada",
    pullRequestNumber: 4940,
    judged: [
      { threadId: "T1", verdict: "fixed", note: "rounded once" },
      { threadId: "T2", verdict: "answered" as never, note: "the brief keeps currency out of scope" },
    ],
  });

  it("resolves every thread the work took up", async () => {
    const pr = pullRequest({ threads: [thread({ id: "T1" }), thread({ id: "T2" })] });
    const effects = await effectsFromVerdict(green(takenUp(record("verdict"))), pr);

    const resolved = effects.filter((e) => /resolve/.test(e.type)).map((e) => e.threadId);
    expect(resolved.sort()).toEqual(["T1", "T2"]);
  });

  it("replies on a thread it answered rather than built", async () => {
    const pr = pullRequest({ threads: [thread({ id: "T1" }), thread({ id: "T2" })] });
    const effects = await effectsFromVerdict(green(takenUp(record("verdict"))), pr);

    expect(effects.some((e) => /reply|answer/.test(e.type) && JSON.stringify(e).includes("T2"))).toBe(true);
  });

  it("asks the recorded reviewer again", async () => {
    const pr = pullRequest({ threads: [thread({ id: "T1" })] });
    const effects = await effectsFromVerdict(green(takenUp(record("verdict"))), pr);

    expect(effects.some((e) => /request/.test(e.type) && e.host === "ada")).toBe(true);
  });
});

describe("publishing a round to a reviewer already on the pull request", () => {
  const greenWith = (overrides: Partial<TicketRecord>): TicketRecord => ({
    ...record("verdict"),
    lastImplementation: { ok: true, output: "", at: "2026-09-03T11:00:00.000Z" },
    lastGate: { ok: true, output: "", at: "2026-09-03T11:05:00.000Z" },
    lastSelfReview: { ok: true, output: "", at: "2026-09-03T11:05:00.000Z", verdict: "APPROVED" },
    lanes: { GATE: { call: `${UNIT}/GATE#2`, end: "GREEN" }, SELF_REVIEW: { call: `${UNIT}/SELF_REVIEW#2`, end: "APPROVED" } },
    pullRequestNumber: 4940,
    ...overrides,
  });

  /** Every effect planned from the verdict until the work waits on a person's review, or stops. */
  async function effectsUntilReview(start: TicketRecord, seen: Observation) {
    const runtime = (await ticketWorkerDeps({ now: () => NOW })).runtime as unknown as WorkflowRuntime<TicketRecord, Observation>;
    const effects: { type: string; [key: string]: unknown }[] = [];
    let current = start;
    for (let count = 0; count < 8 && current.state !== "HUMAN_REVIEW"; count += 1) {
      const decided = plan(current, seen, policy);
      if (decided.kind === "settled" || decided.kind === "wait") break;
      effects.push(...(decided.effects as { type: string }[]));
      current = runtime.apply(applyPlan(current, decided, NOW, {}), decided, {}, seen, NOW, movedBy(current, decided));
    }
    return { effects, reached: current };
  }

  it("asks the recorded reviewer again and assigns nobody else", async () => {
    const pr = pullRequest({ reviews: [{ author: "copilot-pull-request-reviewer[bot]", state: "COMMENTED", commitSha: pullRequest().headSha, submittedAt: "2026-09-03T11:30:00.000Z" }] });
    const { effects, reached } = await effectsUntilReview(greenWith({ reviewer: "edsger" }), observation({ pullRequest: pr }));

    const asked = effects
      .filter((effect) => effect.type === "request-rereview" || effect.type === "assign-reviewer")
      .map((effect) => effect.host);
    expect(asked).toEqual(["edsger"]);
    expect(reached.reviewer).toBe("edsger");
  });

  it("does not say again an answer it already said on the thread", async () => {
    const pr = pullRequest({ threads: [thread({ id: "T2" })] });
    const start = greenWith({
      reviewer: "ada",
      judged: [{ threadId: "T2", verdict: "out-of-scope", note: "the brief keeps currency out of scope" }],
      answered: ["T2"],
    });

    const decided = plan(start, observation({ pullRequest: pr }), policy);

    const replies = (decided.kind === "settled" || decided.kind === "wait" ? [] : decided.effects as { type: string; threadId?: string }[])
      .filter((effect) => effect.type === "reply-thread" && effect.threadId === "T2");
    expect(replies).toHaveLength(0);
  });
});

describe("an answer said on a thread while a conversation is mounted", () => {
  it("is remembered as said, so it is not said again on the next look", async () => {
    const conversation = threads();
    const outcomes: Record<string, unknown> = {};

    await actionsFor(policy)["reply-thread"]!({
      ports: { conversation, tracker: { comment: vi.fn(async () => {}) } },
      ctx: { now: () => NOW },
      announce: async () => {},
    } as never, {
      record: { id: UNIT },
      observation: { ticket: ticket() },
      outcomes,
    } as never, { type: "reply-thread", threadId: "T2", text: "the brief keeps currency out of scope" });

    expect(outcomes.answered).toEqual(["T2"]);
  });
});

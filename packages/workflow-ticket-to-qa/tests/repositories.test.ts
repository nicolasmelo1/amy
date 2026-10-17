import { describe, it, expect, vi } from "vitest";
import { actionsOf, Conversation } from "@amykit/core";
import {
  RecordingNotifier,
  WORKDAY,
  fakeAgent,
  fakeGate,
  fakeGit,
  fakeHost,
  fakeTracker,
  observation,
  policy,
  pullRequest,
  record,
  roster,
  runtimeConfig,
  ticket,
} from "@amykit/test-fixtures";
import { plan } from "../src/machine.js";
import { DEFAULT_POLICY } from "../src/observation.js";
import { TicketRecord } from "../src/record.js";
import { ticketRuntime, TicketRuntimeDeps, workIdFor } from "../src/runtime.js";
import { plugin } from "../src/plugin.js";

const BACKEND = "Northwind/northwind-backend";
const FRONTEND = "Northwind/northwind-frontend";
const both = (merged: Record<string, boolean>) =>
  [BACKEND, FRONTEND].map((repo) => ({ repo, merged: merged[repo] ?? false }));

function runtime(overrides: Partial<TicketRuntimeDeps> = {}) {
  return ticketRuntime({
    tracker: fakeTracker(),
    host: fakeHost(),
    agent: fakeAgent(),
    gate: fakeGate(),
    notifier: new RecordingNotifier(),
    roster: () => roster(),
    now: () => WORKDAY,
    git: fakeGit(),
    layout: { workspaceRoot: "/tmp/amy-fixture", defaultBranch: "main" },
    config: runtimeConfig,
    policy: DEFAULT_POLICY,
    ...overrides,
  });
}

describe("a ticket in two repositories", () => {
  const spanning = ticket({ repo: BACKEND, repos: [BACKEND, FRONTEND], priority: 2 });

  const lookup = { findPullRequestMentioning: vi.fn().mockResolvedValue(null) };

  it("is discovered as one work item per repository, the ticket's own keeping its id, each with its urgency", async () => {
    const found = await runtime({
      tracker: fakeTracker({ inProgress: vi.fn().mockResolvedValue([spanning, ticket({ id: "PROJ-1" })]) }),
      host: fakeHost(null, lookup),
    }).found();

    expect(found).toEqual([
      { workId: "PROJ-1239", priority: 2 },
      { workId: workIdFor("PROJ-1239", FRONTEND), priority: 2 },
      { workId: "PROJ-1" },
    ]);
  });

  it("keeps a running ticket's work item when it is labelled into more repositories", async () => {
    const before = await runtime({ tracker: fakeTracker({ inProgress: vi.fn().mockResolvedValue([ticket()]) }) }).found();
    const after = await runtime({
      tracker: fakeTracker({ inProgress: vi.fn().mockResolvedValue([ticket({ repos: [FRONTEND, BACKEND] })]) }),
      host: fakeHost(null, lookup),
    }).found();

    expect(before).toEqual([{ workId: "PROJ-1239" }]);
    expect(after.map((found) => (typeof found === "string" ? found : found.workId))).toEqual([workIdFor("PROJ-1239", FRONTEND), "PROJ-1239"]);
  });

  it("refuses a ticket in several repositories when the host cannot say they merged", async () => {
    const host = fakeHost();
    delete (host as { findPullRequestMentioning?: unknown }).findPullRequestMentioning;

    await expect(runtime({ tracker: fakeTracker({ inProgress: vi.fn().mockResolvedValue([spanning]) }), host }).found()).rejects.toThrow(
      /cannot find a pull request by a ticket's id/,
    );
  });

  it("names each work item so it is a file name, and nothing is lost", () => {
    expect(workIdFor("PROJ-1239", FRONTEND)).toBe("PROJ-1239@Northwind%2Fnorthwind-frontend");
    expect(workIdFor("PROJ-1239", FRONTEND)).not.toContain("/");
  });

  it("observes each work item in its own repository, asking the tracker by the ticket's id", async () => {
    const get = vi.fn().mockResolvedValue(spanning);
    const findPullRequest = vi.fn().mockResolvedValue(null);

    const seen = await runtime({ tracker: fakeTracker({ get }), host: fakeHost(null, { findPullRequest }) }).observe(
      { ...record("READY"), id: workIdFor("PROJ-1239", FRONTEND) } as TicketRecord,
    );

    expect(get).toHaveBeenCalledWith("PROJ-1239");
    expect(seen.ticket.repo).toBe(FRONTEND);
    expect(findPullRequest).toHaveBeenCalledWith(FRONTEND, spanning.branchName);
  });

  it("runs each repository's work in its own tree", async () => {
    const git = fakeGit();
    const built = runtime({ git });
    const ctx = (repo: string) => ({
      record: { ...record("IMPLEMENTING"), id: workIdFor("PROJ-1239", repo) },
      observation: observation({ ticket: { ...spanning, repo } }),
      outcomes: {},
    });

    await (built.actions["implement"] as (e: unknown, c: unknown) => Promise<void>)({ type: "implement" }, ctx(BACKEND));
    await (built.actions["implement"] as (e: unknown, c: unknown) => Promise<void>)({ type: "implement" }, ctx(FRONTEND));

    expect(git.prepareBranch.mock.calls).toEqual([
      [BACKEND, spanning.branchName, workIdFor("PROJ-1239", BACKEND)],
      [FRONTEND, spanning.branchName, workIdFor("PROJ-1239", FRONTEND)],
    ]);
  });

  it("pushes review fixes to the pull request's own branch, wherever it was found", async () => {
    const git = fakeGit();
    const agent = fakeAgent();
    await (runtime({ git, agent }).actions["address-threads"] as (e: unknown, c: unknown) => Promise<void>)(
      { type: "address-threads", threadIds: [], from: "human" },
      { record: record("HUMAN_FIX"), observation: observation({ pullRequest: pullRequest({ headBranch: "ops/opened-by-hand" }) }), outcomes: {} },
    );

    expect(git.prepareBranch).toHaveBeenCalledWith(expect.any(String), "ops/opened-by-hand", expect.any(String));
    expect(git.commitAndPush.mock.calls[0]?.[1]).toBe("ops/opened-by-hand");
  });

  it("reads whether every repository merged, at the QA handoff only", async () => {
    const findPullRequestMentioning = vi.fn(async (repo: string) => pullRequest({ merged: repo === BACKEND }));
    const built = runtime({ tracker: fakeTracker({ get: vi.fn().mockResolvedValue(spanning) }), host: fakeHost(null, { findPullRequestMentioning }) });
    const id = workIdFor("PROJ-1239", BACKEND);

    const atQa = await built.observe({ ...record("QA_HANDOFF"), id } as TicketRecord);
    const earlier = await built.observe({ ...record("READY"), id } as TicketRecord);

    expect(atQa.repositories).toEqual(both({ [BACKEND]: true }));
    expect(earlier.repositories).toBeUndefined();
  });

  it("does not hand to QA while one repository is unmerged", () => {
    const decision = plan(record("QA_HANDOFF"), observation({ ticket: spanning, repositories: both({ [BACKEND]: true }) }), policy);

    expect(decision.kind).toBe("wait");
    expect(decision.why).toContain(FRONTEND);
  });

  it("hands to QA once, from the first repository's work item, when every one merged", () => {
    const merged = both({ [BACKEND]: true, [FRONTEND]: true });

    const leader = plan(record("QA_HANDOFF"), observation({ ticket: spanning, repositories: merged }), policy);
    const other = plan(record("QA_HANDOFF"), observation({ ticket: { ...spanning, repo: FRONTEND }, repositories: merged }), policy);

    expect(leader).toMatchObject({ kind: "advance", to: "DONE" });
    expect(actionsOf(leader).map((effect) => effect.type)).toEqual(["hand-off-to-qa"]);
    // Behaviour changed: the other waits to see it handed over, so it can
    // still take the handoff if the labels are reordered under it.
    expect(other.kind).toBe("wait");
    expect(actionsOf(other)).toEqual([]);
  });

  it("lets the others finish once they see it handed over", () => {
    const merged = both({ [BACKEND]: true, [FRONTEND]: true });
    const handed = observation({ ticket: { ...spanning, repo: FRONTEND, status: "In QA", assignee: "grace@example.test" }, repositories: merged, inQa: true });

    const other = plan(record("QA_HANDOFF"), handed, policy);

    expect(other).toMatchObject({ kind: "advance", to: "DONE" });
    expect(actionsOf(other)).toEqual([]);
  });

  it("lets a follower finish on the status when the roster moved after the handoff", () => {
    const merged = both({ [BACKEND]: true, [FRONTEND]: true });
    const moved = observation({
      ticket: { ...spanning, repo: FRONTEND, status: "In QA", assignee: "grace@example.test" },
      repositories: merged,
      inQa: true,
      roster: roster({ qa: { tracker: "ada@example.test", host: "ada", available: true } }),
    });

    expect(plan(record("QA_HANDOFF"), moved, policy)).toMatchObject({ kind: "advance", to: "DONE" });
  });

  it("takes the handoff over when a reorder makes a waiting item the first", () => {
    const reordered = [FRONTEND, BACKEND].map((repo) => ({ repo, merged: true }));

    const now = plan(record("QA_HANDOFF"), observation({ ticket: { ...spanning, repo: FRONTEND }, repositories: reordered }), policy);

    expect(actionsOf(now).map((effect) => effect.type)).toEqual(["hand-off-to-qa"]);
  });

  it("waits for a repository added after the first was under way", () => {
    const late = [...both({ [BACKEND]: true, [FRONTEND]: true }), { repo: "Northwind/northwind-mobile", merged: false }];

    const decision = plan(record("QA_HANDOFF"), observation({ ticket: spanning, repositories: late }), policy);

    expect(decision.kind).toBe("wait");
    expect(decision.why).toContain("northwind-mobile");
  });

  it("keeps a ticket in one repository on the old path, handed to QA on approval", () => {
    const decision = plan(record("QA_HANDOFF"), observation(), policy);

    expect(actionsOf(decision).map((effect) => effect.type)).toEqual(["hand-off-to-qa"]);
  });
});

describe("the runtime with its writes handed to the operator", () => {
  const operator = { ...DEFAULT_POLICY, writes: "operator" as const };

  it("declares no action that writes on the tracker or the code host", () => {
    const declared = Object.keys(runtime({ policy: operator }).actions);

    for (const write of ["ask-question", "escalate", "open-pull-request", "resolve-review-thread", "assign-reviewer", "request-rereview", "hand-off-to-qa"]) {
      expect(declared).not.toContain(write);
    }
    expect(declared).toContain("hand-over");
    expect(Object.keys(runtime().actions)).not.toContain("hand-over");
  });

  const handOver = (built: ReturnType<typeof runtime>, outcomes: Record<string, unknown> = {}) =>
    (built.actions["hand-over"] as (e: unknown, c: unknown) => Promise<void>)(
      { type: "hand-over", turns: [{ key: "open-pull-request@x", write: { type: "open-pull-request" } }] },
      { record: record("PR_OPEN"), observation: observation(), outcomes },
    );

  it("says the turn in the work's thread when one is mounted", async () => {
    const notifier = new RecordingNotifier();
    const posted: string[] = [];
    const conversation: Conversation = {
      open: async () => ({ id: "T1" }),
      post: async (_thread, message) => (posted.push(message.text), "m1"),
      replies: async () => [],
    };
    const outcomes: Record<string, unknown> = {};

    await handOver(runtime({ policy: operator, notifier, conversation }), outcomes);

    expect(posted).toHaveLength(1);
    expect(posted[0]).toContain("Open a pull request for PROJ-1239");
    expect(notifier.sent).toEqual([]);
    expect(outcomes["handedOver"]).toEqual(["open-pull-request@x"]);
  });

  it("says it through the notifier when there is no thread", async () => {
    const notifier = new RecordingNotifier();

    await handOver(runtime({ policy: operator, notifier }));

    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0]).toContain("Open a pull request for PROJ-1239");
  });

  it("is mounted claiming no writes", () => {
    const registered: { trackerWrites?: unknown; codeHostWrites?: unknown }[] = [];
    const registry = { workflow: (w: never) => registered.push(w), contribute: () => {} };

    plugin.register(registry as never, { config: { policy: { writes: "operator" } } } as never);
    plugin.register(registry as never, { config: {} } as never);

    expect(registered[0]).toMatchObject({ trackerWrites: [], codeHostWrites: [] });
    expect(registered[1]?.trackerWrites).not.toEqual([]);
  });
});


describe("finding the pull request by the ticket's id", () => {
  const ask = (state: TicketRecord["state"], policy = DEFAULT_POLICY) => {
    const findPullRequestMentioning = vi.fn().mockResolvedValue(pullRequest({ number: 77 }));
    const built = runtime({ policy, host: fakeHost(null, { findPullRequestMentioning }) });
    return { findPullRequestMentioning, seen: built.observe(record(state)) };
  };

  it("finds a renamed ticket's pull request once one exists", async () => {
    const { seen } = ask("HUMAN_REVIEW");
    expect((await seen).pullRequest?.number).toBe(77);
  });

  it("does not search before the machine has opened one itself", async () => {
    for (const state of ["IMPLEMENTING", "PR_OPEN"] as const) {
      const { findPullRequestMentioning, seen } = ask(state);
      expect((await seen).pullRequest).toBeNull();
      expect(findPullRequestMentioning).not.toHaveBeenCalled();
    }
  });

  it("searches at PR_OPEN when the operator opens it, from whatever branch they chose", async () => {
    const { seen } = ask("PR_OPEN", { ...DEFAULT_POLICY, writes: "operator" });
    expect((await seen).pullRequest?.number).toBe(77);
  });
});

describe("a repository that leaves the ticket", () => {
  it("retires the work item started there, once, and says so", async () => {
    // A backend ticket under way, then labelled into the frontend only.
    const relabelled = ticket({ repo: BACKEND, repos: [FRONTEND] });
    const seen = await runtime({ tracker: fakeTracker({ get: vi.fn().mockResolvedValue(relabelled) }) }).observe(record("HUMAN_REVIEW"));

    const decision = plan(record("HUMAN_REVIEW"), seen, policy);

    expect(seen.retired).toBe(true);
    expect(decision).toMatchObject({ kind: "advance", to: "DONE" });
    expect(actionsOf(decision).map((effect) => effect.type)).toEqual(["announce"]);
  });

  it("keeps the ones still named", async () => {
    const seen = await runtime({ tracker: fakeTracker({ get: vi.fn().mockResolvedValue(ticket({ repo: BACKEND, repos: [FRONTEND, BACKEND] })) }) }).observe(record("HUMAN_REVIEW"));

    expect(seen.retired).toBe(false);
  });
});

describe("the operator answering on the ticket with their own account", () => {
  const operator = { ...DEFAULT_POLICY, writes: "operator" as const };
  const own = { author: "Nicolas", body: "In BRL.", at: "2026-09-03T12:30:00.000Z", fromAmy: true };

  it("answers a question asked in operator mode", async () => {
    const triage = { clear: false, questions: ["which currency?"], askedQuestions: [], at: "2026-09-03T12:00:00.000Z" };
    const comments = vi.fn().mockResolvedValue([own]);
    const built = runtime({ policy: operator, tracker: fakeTracker({ comments }) });

    const seen = await built.observe(record("CLARIFYING", { triage }));

    expect(seen.conversation).toEqual([{ ...own, fromAmy: false }]);
    expect(plan(record("CLARIFYING", { triage }), seen, operator)).toMatchObject({ kind: "advance", to: "READY" });
  });

  it("settles an escalation in operator mode", async () => {
    const hasReplyAfter = vi.fn().mockResolvedValue(false);
    const built = runtime({ policy: operator, tracker: fakeTracker({ comments: vi.fn().mockResolvedValue([own]), hasReplyAfter }) });

    const seen = await built.observe(record("ESCALATED", { escalation: { reason: "r", askedAt: "2026-09-03T12:00:00.000Z" } }));

    expect(seen.escalationAnswered).toBe(true);
    expect(hasReplyAfter).not.toHaveBeenCalled();
  });

  it("still reads its own comments as its own when the machine makes the writes", async () => {
    const triage = { clear: false, questions: ["which currency?"], askedQuestions: [], at: "2026-09-03T12:00:00.000Z" };
    const seen = await runtime({ tracker: fakeTracker({ comments: vi.fn().mockResolvedValue([own]) }) }).observe(record("CLARIFYING", { triage }));

    expect(seen.conversation).toEqual([own]);
  });
});

describe("a ticket whose last repository label is taken off", () => {
  it("retires the work item for the repository it named", async () => {
    // Labelled into the frontend once; the tracker now names its team's alone.
    const unlabelled = ticket({ repo: BACKEND });
    const seen = await runtime({ tracker: fakeTracker({ get: vi.fn().mockResolvedValue(unlabelled) }) }).observe(
      { ...record("IMPLEMENTING"), id: workIdFor("PROJ-1239", FRONTEND) } as TicketRecord,
    );

    expect(seen.ticket.repo).toBe(FRONTEND);
    expect(seen.retired).toBe(true);
  });
});

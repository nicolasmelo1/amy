import { type Mock, vi } from "vitest";
import { ticket } from "./builders.js";
import {
  AgentResult,
  AgentRun,
  Announcement,
  AskContext,
  HarnessReply,
  CodeHost,
  Event,
  EventLog,
  Notifier,
  PullRequestView,
  StopSwitch,
  Store,
  checkEvent,
} from "@amykit/core";
import { WorkerConfig } from "@amykit/plugin-serial-engine";
import {
  Agent,
  AttemptOutcome,
  DEFAULT_POLICY,
  Gate,
  TicketGit,
  ThreadVerdict,
  TriageOutcome,
  Ticket,
  TicketRecord,
  TicketRuntimeConfig,
  Tracker,
} from "@amykit/workflow-ticket-to-qa";
export class InMemoryStore implements Store {
  public readonly records = new Map<string, TicketRecord>();

  load(ticketId: string): TicketRecord | null {
    return this.records.get(ticketId) ?? null;
  }

  save(record: TicketRecord): void {
    this.records.set(record.id, structuredClone(record));
  }

  all(): TicketRecord[] {
    return [...this.records.values()];
  }
}

export function fakeTracker(overrides: Partial<Tracker> = {}): Tracker {
  return {
    inProgress: vi.fn<Tracker["inProgress"]>().mockResolvedValue([ticket()]),
    get: vi.fn<Tracker["get"]>().mockResolvedValue(ticket()),
    comment: vi.fn<Tracker["comment"]>().mockResolvedValue(undefined),
    // Whole thread, oldest first. A test that wants a specific conversation
    // overrides it; a test that never names one reads an empty thread, which
    // is what most tickets look like.
    comments: vi.fn<Tracker["comments"]>().mockResolvedValue([]),
    hasReplyAfter: vi.fn<Tracker["hasReplyAfter"]>().mockResolvedValue(false),
    setStatus: vi.fn<Tracker["setStatus"]>().mockResolvedValue(undefined),
    assign: vi.fn<Tracker["assign"]>().mockResolvedValue(undefined),
    createFollowUp: vi.fn<Tracker["createFollowUp"]>().mockResolvedValue("PROJ-9999"),
    ...overrides,
  };
}

export function fakeHost(pr: PullRequestView | null = null, overrides: Partial<CodeHost> = {}): CodeHost {
  return {
    findPullRequest: vi.fn<CodeHost["findPullRequest"]>().mockResolvedValue(pr),
    pullRequestAncestry: vi.fn<NonNullable<CodeHost["pullRequestAncestry"]>>().mockResolvedValue(null),
    pullRequest: vi.fn<CodeHost["pullRequest"]>().mockResolvedValue(pr),
    openPullRequest: vi.fn<CodeHost["openPullRequest"]>().mockResolvedValue(4940),
    requestReview: vi.fn<CodeHost["requestReview"]>().mockResolvedValue(undefined),
    resolveReviewThread: vi.fn<CodeHost["resolveReviewThread"]>().mockResolvedValue(undefined),
    unresolveReviewThread: vi.fn<CodeHost["unresolveReviewThread"]>().mockResolvedValue(undefined),
    reviewLoad: vi.fn<CodeHost["reviewLoad"]>().mockResolvedValue({}),
    reviewsRequestedOf: vi.fn<CodeHost["reviewsRequestedOf"]>().mockResolvedValue([]),
    changesRequestedOf: vi.fn<CodeHost["changesRequestedOf"]>().mockResolvedValue([]),
    merge: vi.fn<CodeHost["merge"]>().mockResolvedValue(undefined),
    submitReview: vi.fn<CodeHost["submitReview"]>().mockResolvedValue(undefined),
    createIssue: vi.fn<CodeHost["createIssue"]>().mockResolvedValue(1204),
    commitStatuses: vi.fn<CodeHost["commitStatuses"]>().mockResolvedValue([]),
    ...overrides,
  };
}

/** A run that spent nothing and went fine, for a test that is about something else. */
export function fakeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    outcome: "completed",
    harness: "fake",
    model: "fake-1",
    tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0.001,
    costSource: "reported",
    durationMs: 1234,
    output: "",
    ...overrides,
  };
}

export function agentResult<T>(value: T, run: Partial<AgentRun> = {}): AgentResult<T> {
  return { value, run: fakeRun(run) };
}

/** A step answered by the fake: what the prompt asked, and the context it ran under. */
type Step<T> = (prompt: string, context?: AskContext) => Promise<AgentResult<T>>;

/** The fake agent: `ask`, plus a mock per step that `ask` routes to. */
export interface ScriptedAgent extends Agent {
  ask: Mock<(prompt: string, cwd: string, context?: AskContext) => Promise<HarnessReply>>;
  triage: Mock<Step<TriageOutcome>>;
  implement: Mock<Step<AttemptOutcome>>;
  addressThreads: Mock<Step<ThreadVerdict[]>>;
}

/**
 * An agent that only answers, as the real one does, scripted by step.
 *
 * `ask` routes on the step its caller named and answers the way a harness
 * would: triage and review verdicts as the JSON their prompts ask for, an
 * implementation as a completed run, or a failed one when the script says it
 * did not hold. Any other step — a self-review — answers with what it was
 * asked. The per-step mocks are what a test scripts and asserts on.
 */
export function fakeAgent(steps: Partial<Pick<ScriptedAgent, "triage" | "implement" | "addressThreads" | "ask">> = {}): ScriptedAgent {
  const triage = steps.triage ?? vi.fn<Step<TriageOutcome>>().mockResolvedValue(
    agentResult({ clear: true, questions: [], askedQuestions: [], at: "2026-09-03T12:00:00.000Z" }),
  );
  const implement = steps.implement ?? vi.fn<Step<AttemptOutcome>>().mockResolvedValue(
    agentResult({ ok: true, output: "", at: "2026-09-03T12:00:00.000Z" }),
  );
  const addressThreads = steps.addressThreads ?? vi.fn<Step<ThreadVerdict[]>>().mockResolvedValue(agentResult([]));

  const ask = steps.ask ?? vi
    .fn<(prompt: string, cwd: string, context?: AskContext) => Promise<HarnessReply>>()
    .mockImplementation(async (prompt, _cwd, context) => {
      if (context?.step === "triage") {
        const { value, run } = await triage(prompt, context);
        return { text: JSON.stringify({ clear: value.clear, questions: value.questions }), run };
      }
      if (context?.step === "implement") {
        const { value, run } = await implement(prompt, context);
        // An attempt that did not hold is a run that did not complete, with
        // what went wrong as its output, which is what a harness reports.
        return value.ok || run.outcome !== "completed"
          ? { text: value.output, run }
          : { text: value.output, run: { ...run, outcome: "failed", output: value.output } };
      }
      if (context?.step === "address-threads") {
        const { value, run } = await addressThreads(prompt, context);
        return { text: JSON.stringify({ verdicts: value }), run };
      }
      return {
        text: `reviewed${context?.brief ? " against the brief" : ""}: ${prompt.slice(0, 60)}`,
        run: fakeRun({ outcome: "completed", output: "" }),
      };
    });

  return { ask, triage, implement, addressThreads } as ScriptedAgent;
}

/** A tree for every item and a branch that always commits, with every call recorded. */
export function fakeGit(changed = true): TicketGit & {
  prepareBranch: Mock<TicketGit["prepareBranch"]>;
  commitAndPush: Mock<TicketGit["commitAndPush"]>;
} {
  const tree = (repo: string, workId?: string): string => `/tmp/amy-fixture/${workId ?? repo}`;
  return {
    pathFor: tree,
    acquire: async (repo, workId) => tree(repo, workId),
    prepareBranch: vi.fn<TicketGit["prepareBranch"]>().mockResolvedValue(undefined),
    commitAndPush: vi.fn<TicketGit["commitAndPush"]>().mockResolvedValue(changed),
  };
}

export function fakeGate(ok = true, output = ""): Gate {
  return {
    run: vi.fn<Gate["run"]>().mockResolvedValue({ ok, output, at: "2026-09-03T12:00:00.000Z" }),
  };
}

export class RecordingNotifier implements Notifier {
  public readonly sent: string[] = [];
  /** The whole announcement, for a test that reads more than the words. */
  public readonly announcements: Announcement[] = [];

  async announce(announcement: Announcement): Promise<void> {
    this.sent.push(announcement.text);
    this.announcements.push(announcement);
  }
}

/** The only channel there was, and it is down. */
export class ThrowingNotifier implements Notifier {
  public attempts = 0;

  async announce(): Promise<void> {
    this.attempts += 1;
    throw new Error("every notification channel failed: inbox: disk is full");
  }
}

/** A log directory that cannot be written to, as the engine experiences it. */
export class ThrowingEventLog implements EventLog {
  public attempts = 0;

  append(): void {
    this.attempts += 1;
    throw new Error("ENOTDIR: not a directory, mkdir '.amy/log'");
  }

  read(): Event[] {
    return [];
  }
}

export const workerConfig: WorkerConfig = {
  staleClaimMs: 30 * 60 * 1000,
  retentionDays: 7,
  maxItemAttempts: 5,
  retryDelayMs: DEFAULT_POLICY.pollBackoffMs,
};

/** What the ticket runtime needs told to it, for a test. */
export const runtimeConfig: TicketRuntimeConfig = {
  repos: ["Northwind/northwind-backend"],
  qaStatusName: "In QA",
};

export function ticketFor(overrides: Partial<Ticket> = {}): Ticket {
  return ticket(overrides);
}
/**
 * The log a test drives the engine through, and the contract's widest net.
 *
 * Appending a line `events.json` does not declare throws here rather than
 * being tolerated, which turns every test that already drives the engine into
 * a conformance test for free.
 */
export class RecordingEventLog implements EventLog {
  public readonly events: Event[] = [];

  append(event: Event): void {
    const problems = checkEvent(event);
    if (problems.length > 0) {
      throw new Error(`this line breaks the event contract: ${problems.join("; ")}`);
    }
    this.events.push(event);
  }

  read(): Event[] {
    return [...this.events];
  }

  kinds(): string[] {
    return this.events.map((e) => e.kind);
  }

  of(kind: string): Event[] {
    return this.events.filter((e) => e.kind === kind);
  }
}

export class FakeStopSwitch implements StopSwitch {
  private why: string | null = null;

  isRequested(): boolean {
    return this.why !== null;
  }

  reason(): string | null {
    return this.why;
  }

  request(reason: string): void {
    this.why = reason;
  }

  clear(): void {
    this.why = null;
  }

  watch(): () => void {
    return () => {};
  }
}

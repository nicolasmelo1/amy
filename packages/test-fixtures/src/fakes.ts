import { vi } from "vitest";
import { ticket } from "./builders.js";
import { AgentResult, AgentRun, Event, EventLog, Notifier, StopSwitch, Store, checkEvent } from "@amy/core";
import { WorkerConfig } from "@amy/plugin-serial-engine";
import { Agent, CodeHost, DEFAULT_POLICY, Gate, PullRequestView, Ticket, TicketRecord, Tracker } from "@amy/workflow-ticket-to-qa";
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
    openPullRequest: vi.fn<CodeHost["openPullRequest"]>().mockResolvedValue(4940),
    requestReview: vi.fn<CodeHost["requestReview"]>().mockResolvedValue(undefined),
    reviewLoad: vi.fn<CodeHost["reviewLoad"]>().mockResolvedValue({}),
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

export function fakeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    triage: vi
      .fn<Agent["triage"]>()
      .mockResolvedValue(agentResult({ clear: true, questions: [], at: "2026-09-03T12:00:00.000Z" })),
    implement: vi
      .fn<Agent["implement"]>()
      .mockResolvedValue(agentResult({ ok: true, output: "", at: "2026-09-03T12:00:00.000Z" })),
    addressThreads: vi.fn<Agent["addressThreads"]>().mockResolvedValue(agentResult([])),
    ...overrides,
  };
}

export function fakeGate(ok = true, output = ""): Gate {
  return {
    run: vi.fn<Gate["run"]>().mockResolvedValue({ ok, output, at: "2026-09-03T12:00:00.000Z" }),
  };
}

export class RecordingNotifier implements Notifier {
  public readonly sent: string[] = [];

  async announce(announcement: { text: string }): Promise<void> {
    this.sent.push(announcement.text);
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
  repos: ["Northwind/northwind-backend"],
  qaStatusName: "In QA",
  policy: DEFAULT_POLICY,
  staleClaimMs: 30 * 60 * 1000,
  retentionDays: 7,
  maxItemAttempts: 5,
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

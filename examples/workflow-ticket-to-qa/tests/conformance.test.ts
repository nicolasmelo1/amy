import { beforeAll, describe, it } from "vitest";
import {
  Agent,
  AskContext,
  AttemptOutcome,
  CodeHost,
  CommandRunner,
  Comment,
  HarnessReply,
  PullRequestView,
  Tracker,
  WorkflowRuntime,
} from "@amykit/core";
import { World, conforms } from "@amykit/workflow-testkit";
import { fakeHost, fakeRun, fakeTracker, pullRequest, thread, ticket } from "@amykit/test-fixtures";
import { ThreadVerdict, TicketRecord } from "../src/index.js";
import { newRecord, workflow as ticketToQa } from "./drawn.js";
import { mountedTicket } from "./mounted.js";

const BOT = "copilot-pull-request-reviewer[bot]";

/**
 * The road one world takes, where it is not the long one: a record that
 * starts further along, a pull request that is already there or opens a
 * certain way, an agent or a gate that never gets there, and how many times
 * the people around it move before the world ends.
 */
interface Road {
  readonly start?: (now: Date) => TicketRecord;
  readonly pr?: PullRequestView;
  /** What the pull request the runtime opens looks like, beyond its head. */
  readonly opens?: Partial<PullRequestView>;
  readonly clear?: boolean;
  readonly implementFails?: boolean;
  readonly gateRed?: boolean;
  /** The review asks for changes the first time it reads the change. */
  readonly reviewAsks?: boolean;
  readonly moves?: number;
}

/**
 * One ticket's whole world, doing what the people in it would do while the
 * machine waits: answering the question it asked, reviewing the head it
 * pushed, settling the disagreement it escalated.
 *
 * Stateful on purpose. The testkit drives the workflow's own runtime against
 * these ports and calls every handler for real, so a port that ignored what
 * it was handed would be proving itself rather than the workflow.
 */
class TicketWorld implements World {
  readonly name: string;
  readonly workId = ticket().id;
  readonly meanwhile: (() => void)[];
  readonly start?: (now: Date) => TicketRecord;

  private readonly comments: Comment[] = [];
  private readonly replies: string[] = [];
  private followUp: string | undefined;
  private pr: PullRequestView | null = null;
  private heads = 0;
  /** Files the agent changed since the last commit; only a commit publishes them. */
  private changed = false;
  private triaged = 0;
  private gateRuns = 0;
  private humanReviewCount = 0;
  private humanThreadAnswered = 0;
  private reviews = 0;
  private now: () => Date = () => new Date();
  private mounted: WorkflowRuntime | undefined;

  constructor(name: string, private readonly road: Road = {}) {
    this.name = name;
    if (road.start) this.start = road.start;
    this.pr = road.pr ?? null;
    // More than the long road needs: a `meanwhile` only runs while the
    // machine waits, so one left over is one nobody waited for.
    this.meanwhile = Array.from({ length: road.moves ?? 12 }, () => () => this.somebodyMoves());
  }

  /**
   * Mounted as the host mounts it, so the gate and the review run as the
   * lanes of `checks`; its clock is the walk's, read when asked.
   */
  async mount(): Promise<void> {
    this.mounted = (await mountedTicket(
      { tracker: this.tracker(), host: this.host(), agent: this.agent(), gate: { run: async () => this.gate() } },
      () => this.now(),
      this.git(),
    )).runtime;
  }

  runtime(now: () => Date): WorkflowRuntime {
    this.now = now;
    return this.mounted!;
  }

  /** What the people around the ticket do next, one move per wait. */
  private somebodyMoves(): void {
    const at = this.now().toISOString();
    if (this.comments.some((c) => c.fromAmy) && !this.comments.some((c) => !c.fromAmy)) {
      this.comments.push({ author: "ada", body: "The one sent on the first of the month.", at, fromAmy: false });
      return;
    }
    if (this.followUp && this.replies.length === 0) {
      this.replies.push(at);
      return;
    }
    const pr = this.pr;
    if (!pr) return;
    if (!pr.reviews.some((r) => r.author === BOT && r.commitSha === pr.headSha)) {
      const first = !pr.reviews.some((r) => r.author === BOT);
      this.pr = {
        ...pr,
        reviews: [...pr.reviews, { author: BOT, state: "COMMENTED", commitSha: pr.headSha, submittedAt: at }],
        threads: first ? [...pr.threads, thread({ id: "B1", author: "copilot-pull-request-reviewer" })] : pr.threads,
      };
      return;
    }
    const reviewer = pr.requestedReviewers[0];
    if (reviewer) this.humanReviews(reviewer, at);
  }

  private humanReviews(reviewer: string, at: string): void {
    const pr = this.pr!;
    this.humanReviewCount += 1;
    const approves = this.humanReviewCount > 1;
    this.pr = {
      ...pr,
      reviewDecision: approves ? "APPROVED" : "CHANGES_REQUESTED",
      requestedReviewers: pr.requestedReviewers.filter((r) => r !== reviewer),
      reviews: [...pr.reviews, { author: reviewer, state: approves ? "APPROVED" : "CHANGES_REQUESTED", commitSha: pr.headSha, submittedAt: at }],
      threads: approves ? pr.threads : [...pr.threads, thread({ id: "H1", author: reviewer, body: "why a second index?" })],
    };
  }

  private push(): void {
    this.heads += 1;
    if (this.pr) this.pr = { ...this.pr, headSha: String(this.heads).padStart(40, "0") };
  }

  private tracker(): Tracker {
    return fakeTracker({
      inProgress: async () => [ticket()],
      get: async () => ticket(),
      comment: async (_id, body) => {
        this.comments.push({ author: "amy", body, at: this.now().toISOString(), fromAmy: true });
      },
      comments: async (_id, since) => this.comments.filter((c) => since === undefined || c.at > since),
      hasReplyAfter: async (_id, since) => this.replies.some((at) => at > since),
      setStatus: async () => {},
      assign: async () => {},
      createFollowUp: async () => (this.followUp = "PROJ-9999"),
    });
  }

  private host(): CodeHost {
    return fakeHost(null, {
      findPullRequest: async () => this.pr,
      openPullRequest: async () => {
        this.pr = pullRequest({ headSha: "0".repeat(40), ...this.road.opens });
        return this.pr.number;
      },
      requestReview: async (_repo, _number, login) => {
        if (this.pr) this.pr = { ...this.pr, requestedReviewers: [...this.pr.requestedReviewers, login] };
      },
      resolveReviewThread: async (id) => {
        if (this.pr) this.pr = { ...this.pr, threads: this.pr.threads.map((t) => (t.id === id ? { ...t, isResolved: true } : t)) };
      },
      reviewLoad: async () => ({ ada: 2, alan: 0, edsger: 1 }),
    });
  }

  /**
   * The agent, which only answers: each step is a prompt named in the
   * context, and it answers the way a harness would. The review step reads
   * which threads it was asked about off the prompt, as a reviewer would.
   */
  private agent(): Agent {
    return {
      ask: async (prompt: string, _cwd: string, context?: AskContext): Promise<HarnessReply> => {
        if (context?.step === "triage") {
          this.triaged += 1;
          const clear = this.road.clear === true || this.triaged > 1;
          return { text: JSON.stringify({ clear, questions: clear ? [] : ["Which invoice is wrong?"] }), run: fakeRun() };
        }
        if (context?.step === "address-threads") {
          const ids = [...prompt.matchAll(/^\[([^\]]+)\] /gm)].map((match) => match[1]!);
          const verdicts: ThreadVerdict[] = ids.map((id) => {
            // The first human comment is one the agent will not change without
            // the owner, which is the road through `ESCALATED`.
            const disagrees = id === "H1" && this.humanThreadAnswered++ === 0;
            return { threadId: id, verdict: disagrees ? "disagreed" : "fixed", note: disagrees ? "the index is load-bearing" : "done" };
          });
          if (verdicts.some((v) => v.verdict === "fixed")) this.changed = true;
          return { text: JSON.stringify({ verdicts }), run: fakeRun() };
        }
        if (context?.step === "implement" && this.road.implementFails) {
          return { text: "", run: fakeRun({ outcome: "failed", output: "it would not compile" }) };
        }
        if (context?.step === "implement") this.changed = true;
        if (context?.step === "self-review" && this.road.reviewAsks && this.reviews++ === 0) {
          return { text: "CHANGES_ASKED: the total is rounded twice", run: fakeRun() };
        }
        return { text: "looks right against the ticket\nAPPROVED", run: fakeRun() };
      },
    };
  }

  /**
   * A git that answers the way a real one would about this world's tree: the
   * agent only edits files, and the head moves when, and only when, the
   * runtime commits them.
   */
  private git(): CommandRunner {
    return {
      run: async (_command, args) => {
        let stdout = "";
        if (args[0] === "status") stdout = this.changed ? " M invoice.md\n" : "";
        if (args[0] === "commit") {
          this.changed = false;
          this.push();
        }
        if (args[0] === "rev-parse") stdout = `${String(this.heads).padStart(40, "0")}\n`;
        return { ok: true, exitCode: 0, stdout, stderr: "" };
      },
    };
  }

  /** Red the first time, so the verdict is reached both ways. */
  private gate(): AttemptOutcome {
    this.gateRuns += 1;
    if (this.road.gateRed) return { ok: false, output: "1 test failed", at: this.now().toISOString() };
    return { ok: this.gateRuns > 1, output: this.gateRuns > 1 ? "" : "1 test failed", at: this.now().toISOString() };
  }
}

const WORLDS: TicketWorld[] = [
      new TicketWorld("a ticket that takes the long road to QA"),
      new TicketWorld("a ticket clear as written", { clear: true }),
      new TicketWorld("an implementation the agent never finishes", { clear: true, implementFails: true, moves: 0 }),
      new TicketWorld("a gate that never goes green", { clear: true, gateRed: true, moves: 0 }),
      new TicketWorld("a pull request too large to hand an agent", { clear: true, opens: { changedFiles: 400 }, moves: 1 }),
      new TicketWorld("a branch the forge says is broken", { clear: true, opens: { checks: { state: "failing", commitSha: "0".repeat(40) } }, moves: 2 }),
      ...(["COPILOT_WAIT", "COPILOT_FIX", "REVIEWER_ASSIGNED", "HUMAN_REVIEW", "HUMAN_FIX"] as const).map((state) =>
        new TicketWorld(`a pull request that is gone in ${state}`, { start: (now) => ({ ...newRecord(ticket().id, now), state }), moves: 0 })),
      new TicketWorld("a review whose reviewer was never recorded", {
        start: (now) => ({ ...newRecord(ticket().id, now), state: "HUMAN_REVIEW" }),
        pr: pullRequest({ headSha: "0".repeat(40) }),
        moves: 0,
      }),
      new TicketWorld("a re-review with nobody to ask", {
        start: (now) => ({ ...newRecord(ticket().id, now), state: "RE_REVIEW" }),
        pr: pullRequest({ headSha: "0".repeat(40) }),
        moves: 0,
      }),
      new TicketWorld("a reviewer who asks for changes and leaves no thread", {
        start: (now) => ({ ...newRecord(ticket().id, now), state: "HUMAN_REVIEW", reviewer: "alan" }),
        pr: pullRequest({
          headSha: "0".repeat(40),
          reviewDecision: "CHANGES_REQUESTED",
          reviews: [{ author: "alan", state: "CHANGES_REQUESTED", commitSha: "0".repeat(40), submittedAt: "2026-09-03T11:00:00.000Z" }],
        }),
        moves: 0,
      }),
      new TicketWorld("a review that asks for changes the gate did not", { clear: true, reviewAsks: true, moves: 0 }),
];

describe("ticket-to-qa", () => {
  beforeAll(async () => {
    for (const world of WORLDS) await world.mount();
  });

  conforms(ticketToQa, {
    runner: { describe, it },
    runtime: (world, now) => (world as TicketWorld).runtime(now),
    worlds: WORLDS,
    // Shipped, so every arrow its diagram draws is one some world walks.
    everyEdge: true,
  });
});

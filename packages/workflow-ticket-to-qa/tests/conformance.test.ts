import { describe, it } from "vitest";
import {
  AgentResult,
  AttemptOutcome,
  CodeHost,
  Comment,
  CommandRunner,
  Git,
  PullRequestView,
  ReviewThread,
  ThreadVerdict,
  Tracker,
} from "@amykit/core";
import { World, conforms } from "@amykit/workflow-testkit";
import { fakeHost, fakeRun, fakeTracker, pullRequest, roster, runtimeConfig, thread, ticket } from "@amykit/test-fixtures";
import { DEFAULT_POLICY, ticketRuntime, ticketToQa } from "../src/index.js";

const BOT = "copilot-pull-request-reviewer[bot]";

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

  private readonly comments: Comment[] = [];
  private readonly replies: string[] = [];
  private followUp: string | undefined;
  private pr: PullRequestView | null = null;
  private heads = 0;
  private triaged = 0;
  private gateRuns = 0;
  private humanReviewCount = 0;
  private humanThreadAnswered = 0;
  private now: () => Date = () => new Date();

  constructor(name: string) {
    this.name = name;
    // More than the road needs: a `meanwhile` only runs while the machine
    // waits, so one left over is one nobody waited for.
    this.meanwhile = Array.from({ length: 12 }, () => () => this.somebodyMoves());
  }

  runtime(now: () => Date) {
    this.now = now;
    const git = new Git({ run: () => Promise.reject(new Error("no git in this world")) } as CommandRunner, {
      workspaceRoot: "/tmp/amy-conformance",
      defaultBranch: "main",
    });
    return ticketRuntime({
      tracker: this.tracker(),
      host: this.host(),
      agent: this.agent(),
      gate: { run: async () => this.gate() },
      notifier: { announce: async () => {} },
      roster: () => roster({ confirmedOn: now().toISOString().slice(0, 10) }),
      now,
      git,
      layout: { workspaceRoot: "/tmp/amy-conformance", defaultBranch: "main" },
      config: runtimeConfig,
      policy: DEFAULT_POLICY,
    });
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
        this.pr = pullRequest({ headSha: "0".repeat(40) });
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

  private agent() {
    const done = <T>(value: T): AgentResult<T> => ({ value, run: fakeRun() });
    return {
      triage: async () => {
        this.triaged += 1;
        const clear = this.triaged > 1;
        const questions = clear ? [] : ["Which invoice is wrong?"];
        return done({ clear, questions, askedQuestions: questions, at: this.now().toISOString() });
      },
      implement: async () => done<AttemptOutcome>({ ok: true, output: "", at: this.now().toISOString() }),
      addressThreads: async (_ticket: unknown, threads: readonly ReviewThread[]) => {
        const verdicts: ThreadVerdict[] = threads.map((t) => {
          // The first human comment is one the agent will not change without
          // the owner, which is the road through `ESCALATED`.
          const disagrees = t.id === "H1" && this.humanThreadAnswered++ === 0;
          return { threadId: t.id, verdict: disagrees ? "disagreed" : "fixed", note: disagrees ? "the index is load-bearing" : "done" };
        });
        if (verdicts.some((v) => v.verdict === "fixed")) this.push();
        return done(verdicts);
      },
      ask: async () => ({ text: "looks right against the ticket", run: fakeRun() }),
    };
  }

  /** Red the first time, so `CHECKED` is left both ways. */
  private gate(): AttemptOutcome {
    this.gateRuns += 1;
    return { ok: this.gateRuns > 1, output: this.gateRuns > 1 ? "" : "1 test failed", at: this.now().toISOString() };
  }
}

describe("ticket-to-qa", () => {
  conforms(ticketToQa, {
    runner: { describe, it },
    runtime: (world, now) => world.runtime(now),
    worlds: [new TicketWorld("a ticket that takes the long road to QA")],
  });
});

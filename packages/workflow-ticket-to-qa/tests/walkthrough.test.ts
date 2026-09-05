import { describe, it, expect } from "vitest";
import { Effect } from "../src/effects.js";
import { plan } from "../src/machine.js";
import { EffectOutcomes, applyTicketPlan } from "../src/outcomes.js";
import { PullRequestView, ReviewSubmission, ReviewThread, actionsOf } from "@amykit/core";
import { Observation } from "../src/observation.js";
import { TicketRecord, newRecord } from "../src/record.js";
import { TicketState } from "../src/state.js";
import { WORKDAY, policy, roster, ticket } from "@amykit/test-fixtures";

const BOT = "copilot-pull-request-reviewer[bot]";

/**
 * A stand-in for the tracker, the code host and the agent, driven by a script.
 *
 * It exists so the whole lifecycle can be walked end to end without any I/O,
 * which is what proves the machine terminates instead of parking somewhere.
 */
class FakeWorld {
  pullRequest: PullRequestView | null = null;
  questionAnswered = false;
  escalationAnswered = false;
  reviewLoad: Record<string, number> = {
    "ada": 5,
    alan: 1,
    edsger: 3,
  };
  handedToQa: string | null = null;
  announcements: string[] = [];
  private heads = 0;
  private clock = WORKDAY.getTime();

  constructor(
    /** Threads the bot leaves the first time it reviews. */
    private readonly botThreads: ReviewThread[] = [],
    /** What the human does, in order, each time they review. */
    private readonly humanScript: {
      decision: "APPROVED" | "CHANGES_REQUESTED";
      threads?: ReviewThread[];
    }[] = [{ decision: "APPROVED" }],
    /** Threads the agent refuses to change, by id. */
    private readonly disagreeWith: string[] = [],
    /** What the forge's checks say when the pull request is opened. */
    private readonly checksStart: "passing" | "failing" | "running" = "passing",
    /** What the forge says stands between the branch and its base. */
    private readonly mergeState: "mergeable" | "conflicting" | "behind" = "mergeable",
  ) {}

  private now(): Date {
    this.clock += 1000;
    return new Date(this.clock);
  }

  private nextHead(): string {
    this.heads += 1;
    return String(this.heads).padStart(40, "0");
  }

  observe(): Observation {
    return {
      ticket: ticket(),
      pullRequest: this.pullRequest,
      reviewLoad: this.reviewLoad,
      roster: roster(),
      questionAnswered: this.questionAnswered,
      escalationAnswered: this.escalationAnswered,
      now: new Date(this.clock),
    };
  }

  /** Everything the outside world does on its own between two looks. */
  advanceWorld(record: TicketRecord): void {
    const pr = this.pullRequest;
    if (!pr) return;

    const sawHead = (author: string): boolean =>
      pr.reviews.some((r) => r.author === author && r.commitSha === pr.headSha);

    if (!sawHead(BOT)) {
      const first = pr.reviews.every((r) => r.author !== BOT);
      this.pullRequest = {
        ...pr,
        reviews: [...pr.reviews, this.reviewBy(BOT, "COMMENTED", pr.headSha)],
        threads: first ? [...pr.threads, ...this.botThreads] : pr.threads,
      };
      return;
    }

    const reviewer = record.reviewer;
    const reviewRequested = pr.requestedReviewers.includes(reviewer ?? "");
    if (reviewer && reviewRequested && !sawHead(reviewer)) {
      const step = this.humanScript.shift() ?? { decision: "APPROVED" as const };
      this.pullRequest = {
        ...pr,
        reviewDecision: step.decision,
        requestedReviewers: pr.requestedReviewers.filter((r) => r !== reviewer),
        reviews: [...pr.reviews, this.reviewBy(reviewer, step.decision, pr.headSha)],
        threads: [...pr.threads, ...(step.threads ?? [])],
      };
    }
  }

  private reviewBy(
    author: string,
    state: ReviewSubmission["state"],
    commitSha: string,
  ): ReviewSubmission {
    return { author, state, commitSha, submittedAt: this.now().toISOString() };
  }

  execute(record: TicketRecord, effects: readonly Effect[]): EffectOutcomes {
    const outcomes: EffectOutcomes = {};

    for (const effect of effects) {
      switch (effect.type) {
        case "triage":
          outcomes.triage = { clear: true, questions: [], at: this.now().toISOString() };
          break;
        case "ask-question":
          this.questionAnswered = true;
          break;
        case "implement":
          outcomes.implementation = { ok: true, output: "", at: this.now().toISOString() };
          break;
        case "run-gate":
          outcomes.gate = { ok: true, output: "", at: this.now().toISOString() };
          break;
        case "open-pull-request": {
          const head = this.nextHead();
          this.pullRequest = {
            number: 4940,
            url: "https://github.example.test/acme/widgets/pull/4940",
            headSha: head,
            isDraft: false,
            changedFiles: 3,
            additions: 40,
            deletions: 12,
            reviewDecision: "REVIEW_REQUIRED",
            checks: { state: this.checksStart, commitSha: head },
            mergeState: this.mergeState,
            reviews: [],
            threads: [],
            requestedReviewers: [],
          };
          outcomes.pullRequestNumber = 4940;
          break;
        }
        case "assign-reviewer":
          outcomes.reviewer = effect.host;
          this.request(effect.host);
          break;
        case "request-rereview":
          this.request(effect.host);
          break;
        case "address-threads":
          outcomes.verdicts = effect.threadIds.map((id) => ({
            threadId: id,
            verdict: this.disagreeWith.includes(id) ? ("disagreed" as const) : ("fixed" as const),
            note: "n",
          }));
          this.resolve(effect.threadIds.filter((id) => !this.disagreeWith.includes(id)));
          break;
        case "escalate":
          outcomes.escalation = { reason: effect.reason, askedAt: this.now().toISOString() };
          // The owner sides with the reviewer, so the next pass fixes it.
          this.escalationAnswered = true;
          // An owner handed a broken branch deals with it. Without this the
          // walk would escalate, be answered, come back to the same red
          // rollup and escalate again — which is a spin, not a lifecycle.
          if (this.pullRequest) {
            this.pullRequest = {
              ...this.pullRequest,
              checks: { state: "passing", commitSha: this.pullRequest.headSha },
              mergeState: "mergeable",
            };
          }
          this.disagreeWith.length = 0;
          outcomes.escalationResolvedAt = this.now().toISOString();
          break;
        case "hand-off-to-qa":
          this.handedToQa = effect.tracker;
          break;
        case "announce":
          this.announcements.push(effect.text);
          break;
      }
    }

    void record;
    return outcomes;
  }

  private request(host: string): void {
    if (!this.pullRequest) return;
    this.pullRequest = {
      ...this.pullRequest,
      requestedReviewers: [...new Set([...this.pullRequest.requestedReviewers, host])],
    };
  }

  /** Pushing a fix resolves the thread and moves the head, as a real push does. */
  private resolve(threadIds: string[]): void {
    if (!this.pullRequest || threadIds.length === 0) return;
    this.pullRequest = {
      ...this.pullRequest,
      headSha: this.nextHead(),
      threads: this.pullRequest.threads.map((t) =>
        threadIds.includes(t.id) ? { ...t, isResolved: true } : t,
      ),
    };
  }
}

/** Runs the machine until it settles, or gives up so a loop cannot hang a test. */
function drive(world: FakeWorld, limit = 80): { record: TicketRecord; states: TicketState[] } {
  let record = newRecord("PROJ-1239", WORKDAY);
  const states: TicketState[] = [record.state];

  for (let step = 0; step < limit; step += 1) {
    world.advanceWorld(record);
    const decision = plan(record, world.observe(), policy);

    if (decision.kind === "settled") {
      return { record, states };
    }

    const outcomes = world.execute(record, actionsOf(decision) as Effect[]);
    const before = record.state;
    record = applyTicketPlan(record, decision, outcomes, new Date(Date.now() + step));

    if (record.state !== before) {
      states.push(record.state);
    }
  }

  throw new Error(`the machine never settled, it reached ${record.state} via ${states.join(" -> ")}`);
}

describe("driving a ticket end to end", () => {
  it("reaches QA on a clean ticket that gets approved first time", () => {
    const world = new FakeWorld();

    const { record, states } = drive(world);

    expect(record.state).toBe("DONE");
    expect(world.handedToQa).toBe("grace@example.test");
    expect(states).toEqual([
      "DISCOVERED",
      "READY",
      "IMPLEMENTING",
      "CHECKED",
      "PR_OPEN",
      "COPILOT_WAIT",
      "REVIEWER_ASSIGNED",
      "HUMAN_REVIEW",
      "APPROVED",
      "QA_HANDOFF",
      "DONE",
    ]);
  });

  it("assigns the reviewer with the lightest load", () => {
    const world = new FakeWorld();

    const { record } = drive(world);

    expect(record.reviewer).toBe("alan");
  });

  it("fixes what the bot found before a human is ever asked", () => {
    const world = new FakeWorld([
      {
        id: "B1",
        author: "copilot-pull-request-reviewer",
        body: "this index does not enforce the mapping",
        isResolved: false,
        isOutdated: false,
      },
    ]);

    const { record, states } = drive(world);

    expect(record.state).toBe("DONE");
    expect(states).toContain("COPILOT_FIX");
    expect(states.indexOf("COPILOT_FIX")).toBeLessThan(states.indexOf("REVIEWER_ASSIGNED"));
    expect(record.judged).toEqual([{ threadId: "B1", verdict: "fixed", note: "n" }]);
  });

  it("survives a round of requested changes and comes back for approval", () => {
    const world = new FakeWorld(
      [],
      [
        {
          decision: "CHANGES_REQUESTED",
          threads: [
            {
              id: "T1",
              author: "edsger",
              body: "any reason to have a new variable for an existing variable?",
              isResolved: false,
              isOutdated: false,
            },
          ],
        },
        { decision: "APPROVED" },
      ],
    );

    const { record, states } = drive(world);

    expect(record.state).toBe("DONE");
    expect(states).toContain("HUMAN_FIX");
    expect(states).toContain("RE_REVIEW");
    expect(states.filter((s) => s === "HUMAN_REVIEW")).toHaveLength(2);
  });

  it("parks a disagreement with the owner and resumes once they answer", () => {
    const world = new FakeWorld(
      [],
      [
        {
          decision: "CHANGES_REQUESTED",
          threads: [
            {
              id: "T1",
              author: "edsger",
              body: "delete this guard",
              isResolved: false,
              isOutdated: false,
            },
          ],
        },
        { decision: "APPROVED" },
      ],
      ["T1"],
    );

    const { record, states } = drive(world);

    expect(states).toContain("ESCALATED");
    expect(record.state).toBe("DONE");
    expect(record.escalation?.resolvedAt).toBeDefined();
    // The owner's answer put the comment back in play instead of leaving it parked.
    expect(record.judged).toEqual([{ threadId: "T1", verdict: "fixed", note: "n" }]);
  });

  // The forge's complaint has to be a detour and not a dead end. Sending a
  // branch back to its owner lands in ESCALATED, and ESCALATED was built for
  // a disagreement about review comments — a state this arrives in carrying
  // none. What proves the two fit is reaching DONE anyway.
  it("takes the long way round when the checks are red, and still reaches QA", () => {
    const world = new FakeWorld([], [{ decision: "APPROVED" }], [], "failing");

    const { record, states } = drive(world);

    expect(record.state).toBe("DONE");
    expect(states).toContain("ESCALATED");
  });

  it("takes the long way round when the branch conflicts, and still reaches QA", () => {
    const world = new FakeWorld([], [{ decision: "APPROVED" }], [], "passing", "conflicting");

    const { record } = drive(world);

    expect(record.state).toBe("DONE");
  });

  // Nobody is asked to read something the forge has not finished judging.
  it("never asks a reviewer before the checks have a verdict", () => {
    const world = new FakeWorld([], [{ decision: "APPROVED" }], [], "running");

    const { record } = drive(world);

    expect(record.state).toBe("DONE");
  });
});

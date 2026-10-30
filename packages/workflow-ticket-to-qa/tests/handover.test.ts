import { describe, it, expect } from "vitest";
import { PullRequestView, ReviewThread, actionsOf } from "@amykit/core";
import { HEAD, WORKDAY, botReview, botThread, observation, policy as machinePolicy, pullRequest, record, review, ticket } from "@amykit/test-fixtures";
import { Effect, HandOverTurn, isWrite } from "../src/effects.js";
import { plan } from "../src/machine.js";
import { Observation, Policy } from "../src/observation.js";
import { EffectOutcomes, applyTicketPlan } from "../src/outcomes.js";
import { TicketRecord } from "../src/record.js";
import { newRecord } from "./drawn.js";
import { TicketState } from "../src/state.js";

const policy: Policy = { ...machinePolicy, writes: "operator" };
const BOT = "copilot-pull-request-reviewer[bot]";

/**
 * A world where the machine may write nothing and an operator makes every
 * write it is handed, one look later — or, for `slowOperator`, several.
 */
class OperatorWorld {
  pullRequest: PullRequestView | null = null;
  inQa = false;
  /** Every write effect the machine performed itself, which must stay empty. */
  readonly machineWrites: Effect[] = [];
  /** Every turn said to the operator, in order. */
  readonly said: HandOverTurn[] = [];
  private queued: { turn: HandOverTurn; due: number }[] = [];
  private looks = 0;
  private clock = WORKDAY.getTime();

  constructor(
    private readonly botThreads: ReviewThread[] = [],
    private readonly slowOperator = 0,
  ) {}

  observe(): Observation {
    return observation({ pullRequest: this.pullRequest, inQa: this.inQa, now: new Date(this.clock) });
  }

  /** What the operator and the reviewers do between two looks. */
  advanceWorld(current: TicketRecord): void {
    this.looks += 1;
    this.clock += 1000;
    for (const { turn } of this.queued.filter((entry) => entry.due <= this.looks)) this.make(turn);
    this.queued = this.queued.filter((entry) => entry.due > this.looks);

    const pr = this.pullRequest;
    if (!pr) return;
    if (!pr.reviews.some((r) => r.author === BOT && r.commitSha === pr.headSha)) {
      const first = pr.reviews.every((r) => r.author !== BOT);
      this.pullRequest = { ...pr, reviews: [...pr.reviews, botReview(pr.headSha)], threads: first ? this.botThreads : pr.threads };
      return;
    }
    const reviewer = current.reviewer;
    if (reviewer && pr.requestedReviewers.includes(reviewer) && !pr.reviews.some((r) => r.author === reviewer && r.commitSha === pr.headSha)) {
      this.pullRequest = {
        ...pr,
        reviewDecision: "APPROVED",
        requestedReviewers: pr.requestedReviewers.filter((r) => r !== reviewer),
        reviews: [...pr.reviews, review({ author: reviewer, state: "APPROVED", commitSha: pr.headSha, submittedAt: new Date(this.clock).toISOString() })],
      };
    }
  }

  /** The operator, carrying out a write somewhere the team reads. */
  private make({ write }: HandOverTurn): void {
    switch (write.type) {
      case "open-pull-request":
        this.pullRequest = pullRequest({ headSha: HEAD, checks: { state: "passing", commitSha: HEAD } });
        break;
      case "resolve-review-thread":
        if (this.pullRequest) {
          this.pullRequest = {
            ...this.pullRequest,
            threads: this.pullRequest.threads.map((t) => (t.id === write.threadId ? { ...t, isResolved: true } : t)),
          };
        }
        break;
      case "assign-reviewer":
      case "request-rereview":
        if (this.pullRequest) {
          this.pullRequest = { ...this.pullRequest, requestedReviewers: [...this.pullRequest.requestedReviewers, write.host] };
        }
        break;
      case "hand-off-to-qa":
        this.inQa = true;
        break;
      default:
        break;
    }
  }

  execute(effects: readonly Effect[]): EffectOutcomes {
    const outcomes: EffectOutcomes = {};
    const at = () => new Date(this.clock).toISOString();
    for (const effect of effects) {
      if (isWrite(effect)) {
        this.machineWrites.push(effect);
        continue;
      }
      switch (effect.type) {
        case "triage":
          outcomes.triage = { clear: true, questions: [], askedQuestions: [], at: at() };
          break;
        case "implement":
          outcomes.implementation = { ok: true, output: "", at: at() };
          break;
        case "run-gate":
          outcomes.gate = { ok: true, output: "", at: at() };
          break;
        case "self-review":
          outcomes.selfReview = { ok: true, output: "", at: at() };
          break;
        case "address-threads":
          // Fixed, and the honest forge leaves the thread open: closing it
          // is a write, so it is the operator's.
          outcomes.verdicts = effect.threadIds.map((threadId) => ({ threadId, verdict: "fixed" as const, note: "n" }));
          break;
        case "hand-over":
          this.said.push(...effect.turns);
          for (const turn of effect.turns) {
            this.queued.push({ turn, due: this.looks + 1 + this.slowOperator });
            if (turn.write.type === "assign-reviewer") outcomes.reviewer = turn.write.host;
          }
          outcomes.handedOver = effect.turns.map((turn) => turn.key);
          outcomes.handedOverAt = new Date(this.clock).toISOString();
          break;
        default:
          break;
      }
    }
    return outcomes;
  }
}

function drive(world: OperatorWorld, limit = 120) {
  let current = newRecord("PROJ-1239", WORKDAY);
  const states: TicketState[] = [current.state];
  const stillWhileWaiting: TicketState[] = [];

  for (let step = 0; step < limit; step += 1) {
    world.advanceWorld(current);
    const decision = plan(current, world.observe(), policy);
    if (decision.kind === "settled") return { record: current, states, stillWhileWaiting };
    if (decision.kind === "wait") stillWhileWaiting.push(current.state);

    const outcomes = world.execute(actionsOf(decision) as Effect[]);
    const before = current.state;
    current = applyTicketPlan(current, decision, outcomes, new Date(WORKDAY.getTime() + step));
    if (current.state !== before) states.push(current.state);
  }
  throw new Error(`never settled: ${states.join(" -> ")}`);
}

describe("ticket-to-qa with its writes handed to the operator", () => {
  it("walks a ticket to QA making no tracker or code-host write itself", () => {
    const world = new OperatorWorld([botThread({ id: "B1" })]);

    const { record: done } = drive(world);

    expect(done.state).toBe("DONE");
    expect(world.machineWrites).toEqual([]);
    expect(world.inQa).toBe(true);
  });

  it("says each write once", () => {
    const world = new OperatorWorld([botThread({ id: "B1" }), botThread({ id: "B2" })]);

    drive(world);

    const keys = world.said.map((turn) => turn.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(world.said.map((turn) => turn.write.type)).toEqual([
      "open-pull-request",
      "resolve-review-thread",
      "resolve-review-thread",
      "assign-reviewer",
      "hand-off-to-qa",
    ]);
  });

  it("moves past no handed-off write until it sees the effect, however long the operator takes", () => {
    const quick = drive(new OperatorWorld([botThread({ id: "B1" })]));
    const slow = new OperatorWorld([botThread({ id: "B1" })], 4);

    const walked = drive(slow);

    expect(walked.states).toEqual(quick.states);
    expect(slow.said).toHaveLength(4);
    for (const state of ["PR_OPEN", "COPILOT_FIX", "REVIEWER_ASSIGNED", "QA_HANDOFF"] as const) {
      expect(walked.stillWhileWaiting.filter((waited) => waited === state).length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("a handed-off write, one look at a time", () => {
  it("asks the question by handing it over, and waits in CLARIFYING for the answer", () => {
    const decision = plan(
      record("DISCOVERED", { triage: { clear: false, questions: ["which currency?"], askedQuestions: [], at: WORKDAY.toISOString() } }),
      observation(),
      policy,
    );

    expect(decision).toMatchObject({ kind: "advance", to: "CLARIFYING" });
    expect(actionsOf(decision).map((effect) => effect.type)).toEqual(["hand-over"]);
  });

  it("hands the escalation over instead of filing a follow-up", () => {
    const decision = plan(
      record("IMPLEMENTING", { attempts: { IMPLEMENTING: 3 }, lastImplementation: { ok: false, output: "no", at: WORKDAY.toISOString() } }),
      observation(),
      policy,
    );

    expect(decision).toMatchObject({ kind: "advance", to: "ESCALATED" });
    expect(actionsOf(decision)).toMatchObject([{ type: "hand-over", turns: [{ write: { type: "escalate" } }] }]);
  });

  it("waits on a requested review the operator has not made, with the reviewer it chose", () => {
    const decision = plan(
      record("REVIEWER_ASSIGNED", { reviewer: "edsger", handedOver: ["request-review@edsger"] }),
      observation({ pullRequest: pullRequest(), reviewLoad: { edsger: 9 } }),
      policy,
    );

    expect(decision.kind).toBe("wait");
  });

  it("goes on to the review once the forge shows the request", () => {
    const decision = plan(
      record("REVIEWER_ASSIGNED", { reviewer: "edsger", handedOver: ["request-review@edsger"] }),
      observation({ pullRequest: pullRequest({ requestedReviewers: ["edsger"] }) }),
      policy,
    );

    expect(decision).toMatchObject({ kind: "advance", to: "HUMAN_REVIEW" });
    expect(actionsOf(decision)).toEqual([]);
  });

  it("makes every write itself without the switch, exactly as before", () => {
    const decision = plan(record("PR_OPEN"), observation(), machinePolicy);

    expect(actionsOf(decision)).toEqual([{ type: "open-pull-request" }]);
  });
});

describe("a review the operator was asked to request again", () => {
  const asked = "2026-09-03T12:00:00.000Z";
  const sentBack = "2026-09-03T11:00:00.000Z";
  const key = "request-review@edsger@round0";
  const reReview = (overrides: Partial<PullRequestView>) =>
    plan(
      record("RE_REVIEW", { reviewer: "edsger", handedOver: [key], handedOverAt: { [key]: asked } }),
      observation({ pullRequest: pullRequest(overrides) }),
      policy,
    );

  it("is not answered by the review that sent the work back, on the same head", () => {
    const decision = reReview({ reviews: [review({ author: "edsger", state: "CHANGES_REQUESTED", commitSha: HEAD, submittedAt: sentBack })] });

    expect(decision.kind).toBe("wait");
  });

  it("is answered by a request pending on the forge", () => {
    expect(reReview({ requestedReviewers: ["edsger"] })).toMatchObject({ kind: "advance", to: "HUMAN_REVIEW" });
  });

  it("is answered by a review submitted after it was asked", () => {
    const decision = reReview({ reviews: [review({ author: "edsger", state: "CHANGES_REQUESTED", commitSha: HEAD, submittedAt: sentBack }), review({ author: "edsger", state: "APPROVED", commitSha: HEAD, submittedAt: "2026-09-03T12:30:00.000Z" })] });

    expect(decision).toMatchObject({ kind: "advance", to: "HUMAN_REVIEW" });
  });
});

describe("a QA handoff the operator was asked to make", () => {
  const said = record("QA_HANDOFF", { handedOver: ["hand-off-to-qa@grace@example.test"] });

  it("is not done while the status moved and the owner did not", () => {
    const decision = plan(said, observation({ inQa: true, ticket: ticket({ status: "In QA", assignee: "ada@example.test" }) }), policy);

    expect(decision.kind).toBe("wait");
  });

  it("is done once both are there", () => {
    const decision = plan(said, observation({ inQa: true, ticket: ticket({ status: "In QA", assignee: "Grace@Example.test" }) }), policy);

    expect(decision).toMatchObject({ kind: "advance", to: "DONE" });
  });
});

describe("review 2 of the composed workflow", () => {
  const key = "request-review@edsger";
  const pending = (prOverrides: Partial<PullRequestView>, at = "2026-09-03T12:00:00.000Z") =>
    plan(
      record("REVIEWER_ASSIGNED", { reviewer: "edsger", handedOver: [key], handedOverAt: { [key]: at } }),
      observation({ pullRequest: pullRequest(prOverrides) }),
      policy,
    );

  it("does not let a review the operator requested carry red checks past the gate", () => {
    const decision = pending({ requestedReviewers: ["edsger"], checks: { state: "failing", commitSha: HEAD } });

    expect(decision).toMatchObject({ kind: "advance", to: "ESCALATED" });
  });

  it("does not let it carry a conflict past either", () => {
    const decision = pending({ requestedReviewers: ["edsger"], mergeState: "conflicting" });

    expect(decision).toMatchObject({ kind: "advance", to: "ESCALATED" });
  });

  it("matches the reviewer's login without case, as the forge does", () => {
    expect(pending({ requestedReviewers: ["Edsger"] })).toMatchObject({ kind: "advance", to: "HUMAN_REVIEW" });
  });

  it("compares instants as instants, not as text", () => {
    // Earlier than the turn, though it sorts after it as a string.
    const decision = pending(
      { reviews: [review({ author: "edsger", commitSha: HEAD, submittedAt: "2026-09-03T12:00:00Z" })] },
      "2026-09-03T12:00:00.900Z",
    );

    expect(decision.kind).toBe("wait");
  });

  it("says the QA handoff again when the roster names a new owner before it was made", () => {
    const decision = plan(
      record("QA_HANDOFF", { handedOver: ["hand-off-to-qa@ada@example.test"] }),
      observation(),
      policy,
    );

    expect(actionsOf(decision)).toMatchObject([{ type: "hand-over", turns: [{ key: "hand-off-to-qa@grace@example.test" }] }]);
  });

  it("is done when the owner the turn named is assigned, whatever the roster says now", () => {
    const decision = plan(
      record("QA_HANDOFF", { handedOver: ["hand-off-to-qa@grace@example.test"] }),
      observation({ inQa: true, ticket: ticket({ status: "In QA", assignee: "grace@example.test" }) }),
      policy,
    );

    expect(decision).toMatchObject({ kind: "advance", to: "DONE" });
  });
});

describe("a second re-review round on the same head", () => {
  it("is said again rather than answered by the first round's review", () => {
    const toReReview = (at: string) => ({ at, from: "HUMAN_FIX", to: "RE_REVIEW", why: "every comment was addressed" });
    // Round one was said at noon under whatever key that round had; the
    // reviewer sent it back again at 13:00 without anything being pushed,
    // and the work has come back to ask a second time.
    const roundOne = ["request-review@edsger@round1", `request-review@edsger@${HEAD}`];
    const decision = plan(
      record("RE_REVIEW", {
        reviewer: "edsger",
        history: [toReReview("2026-09-03T11:30:00.000Z"), toReReview("2026-09-03T13:30:00.000Z")],
        handedOver: roundOne,
        handedOverAt: Object.fromEntries(roundOne.map((k) => [k, "2026-09-03T12:00:00.000Z"])),
      }),
      observation({
        pullRequest: pullRequest({
          reviews: [
            review({ author: "edsger", state: "CHANGES_REQUESTED", commitSha: HEAD, submittedAt: "2026-09-03T11:00:00.000Z" }),
            review({ author: "edsger", state: "CHANGES_REQUESTED", commitSha: HEAD, submittedAt: "2026-09-03T13:00:00.000Z" }),
          ],
        }),
      }),
      policy,
    );

    expect(actionsOf(decision)).toMatchObject([{ type: "hand-over", turns: [{ key: "request-review@edsger@round2", write: { type: "request-rereview" } }] }]);
  });
});

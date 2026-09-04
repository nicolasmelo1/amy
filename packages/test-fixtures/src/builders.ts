import { PullRequestView, ReviewSubmission, ReviewThread } from "@amy/core";
import { DEFAULT_POLICY, Observation, Policy, Roster, Ticket, TicketRecord, TicketState, newRecord } from "@amy/workflow-ticket-to-qa";
/** A Thursday, so workday rules apply unless a test says otherwise. */
export const WORKDAY = new Date("2026-09-03T12:00:00.000Z");
/** A Saturday. */
export const WEEKEND = new Date("2026-09-05T12:00:00.000Z");

export const HEAD = "a".repeat(40);
export const OLD_HEAD = "b".repeat(40);

export function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "PROJ-1239",
    title: "The total is wrong on the invoice",
    team: "Platform",
    url: "https://linear.app/northwind/issue/PROJ-1239/total-is-wrong",
    branchName: "ada/proj-1239-total-is-wrong",
    status: "In Progress",
    repo: "Northwind/northwind-backend",
    ...overrides,
  };
}

export function roster(overrides: Partial<Roster> = {}): Roster {
  return {
    confirmedOn: "2026-09-03",
    reviewers: [
      { tracker: "ada@example.test", host: "ada", available: true },
      { tracker: "alan@example.test", host: "alan", available: true },
      { tracker: "edsger@example.test", host: "edsger", available: true },
    ],
    qa: { tracker: "grace@example.test", host: "grace", available: true },
    ...overrides,
  };
}

export function review(overrides: Partial<ReviewSubmission> = {}): ReviewSubmission {
  return {
    author: "ada",
    state: "COMMENTED",
    commitSha: HEAD,
    submittedAt: "2026-09-03T11:00:00.000Z",
    ...overrides,
  };
}

export function thread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id: "T1",
    author: "ada",
    body: "why do we need this?",
    isResolved: false,
    isOutdated: false,
    ...overrides,
  };
}

export function pullRequest(overrides: Partial<PullRequestView> = {}): PullRequestView {
  return {
    number: 4940,
    headSha: HEAD,
    isDraft: false,
    reviewDecision: "REVIEW_REQUIRED",
    reviews: [],
    threads: [],
    requestedReviewers: [],
    ...overrides,
  };
}

export function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    ticket: ticket(),
    pullRequest: null,
    reviewLoad: {},
    roster: roster(),
    questionAnswered: false,
    escalationAnswered: false,
    now: WORKDAY,
    ...overrides,
  };
}

export function record(
  state: TicketState,
  overrides: Partial<TicketRecord> = {},
): TicketRecord {
  return { ...newRecord("PROJ-1239", WORKDAY), state, ...overrides };
}

export const policy: Policy = DEFAULT_POLICY;

/** An automated review by the bot on the given head. */
export function botReview(sha = HEAD): ReviewSubmission {
  return review({ author: "copilot-pull-request-reviewer[bot]", commitSha: sha });
}

export function botThread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return thread({
    id: "B1",
    author: "copilot-pull-request-reviewer",
    body: "this index does not enforce the stated one-to-one mapping",
    ...overrides,
  });
}
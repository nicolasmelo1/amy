import { Plan, PullRequestView, WorkRecord, act, advance, settled, wait } from "@amykit/core";

export type PullRequestState = "OPENING" | "OPENED" | "REFUSED";

/** What a caller passes. A type rather than an interface, so it is a record of settings like any other input. */
export type PullRequestInput = {
  repo: string;
  branch: string;
  title: string;
  body: string;
  base?: string;
  mentions?: string;
};

export interface PullRequestRecord extends WorkRecord {
  state: PullRequestState;
  input: PullRequestInput;
  /** The number the host answered with when it opened one, before a look has found it. */
  requested?: number;
  /** What the host said when it answered that it would not open one. */
  refusal?: string;
  pullRequest?: { number: number; url: string };
}

export interface Observation {
  /** The pull request on the branch, or the one whose title names `mentions`, or none. */
  pullRequest: PullRequestView | null;
}

export interface Policy {
  /** How long to wait for a pull request the host said it opened to be one it shows. */
  settleMs: number;
}

export const DEFAULT_POLICY: Policy = { settleMs: 30_000 };

export type Effect = { type: "open-pull-request" };

type Decision = (record: PullRequestRecord, observation: Observation, policy: Policy) => Plan;

export const decide = {
  OPENING: planOpening,
  OPENED: () => settled("the pull request exists, and what happens to it is the caller's"),
  REFUSED: () => settled("the host would not open a pull request, and the caller was given its reason"),
} satisfies Record<PullRequestState, Decision>;

/**
 * Finds the pull request before it opens one, so a look that runs again
 * after a crash — or a branch somebody already opened by hand — never opens
 * a second.
 */
function planOpening(record: PullRequestRecord, observation: Observation, policy: Policy): Plan {
  if (observation.pullRequest) {
    return advance("OPENED", `pull request #${observation.pullRequest.number} is open on ${record.input.branch}`);
  }
  // The host said it opened one and does not show it yet: asking again
  // would open a second.
  if (record.requested !== undefined) {
    return wait(policy.settleMs, `the host opened #${record.requested} and does not show it yet`);
  }
  // An answer, not an outage: asking again would hear it again. An outage
  // never reaches here — it fails the look, and the engine retries it.
  if (record.refusal !== undefined) {
    return advance("REFUSED", `the host would not open a pull request on ${record.input.branch}: ${record.refusal}`);
  }
  return act(`the branch ${record.input.branch} has no pull request yet`, { type: "open-pull-request" });
}

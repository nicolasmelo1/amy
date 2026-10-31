import { WorkRecord } from "@amykit/core";
import type { PullRequestInput } from "@amykit/workflow-pull-request";
import type { ErrandState } from "./decide.js";

export interface AttemptOutcome {
  ok: boolean;
  /** Whatever the agent said, verbatim, for the next prompt or the report. */
  output: string;
  at: string;
}

/**
 * Everything the machine remembers about one task, between looks.
 *
 * `repo` and `slug` are copied off the task on the first look rather than
 * read from it every time, because the ceiling is counted across *other*
 * records without opening every task to find out what each one was about.
 */
export interface ErrandRecord extends WorkRecord {
  /** Narrowed from the core's plain label to this workflow's own states. */
  state: ErrandState;
  repo?: string;
  /** The name the branch takes. */
  slug?: string;
  lastAttempt?: AttemptOutcome;
  /**
   * Whether the last attempt left a change on a branch.
   *
   * False is a real answer rather than a failure: "check whether the monitor
   * is still firing" is an errand that ends in a sentence, not a diff.
   */
  changed?: boolean;
  /** Why the agent said it would not do this, which no retry changes. */
  declined?: string;
  /** What the pull request is opened with, worked out when the errand reaches `PR_OPEN`: its call is passed this. */
  opening?: PullRequestInput;
  pullRequestNumber?: number;
  pullRequestUrl?: string;
  /** What the code host said when it would not open the pull request. */
  refusal?: string;
  /** What was asked, kept when the errand reaches `PR_OPEN` so the edge out of the call can say it. */
  asked?: string;
}

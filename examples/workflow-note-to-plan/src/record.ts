import { WorkRecord } from "@amykit/core";
import type { PullRequestInput } from "@amykit/workflow-pull-request";
import type { PlanState } from "./decide.js";

export interface AttemptOutcome {
  ok: boolean;
  /** Whatever the agent or the check said, verbatim, for the next prompt. */
  output: string;
  at: string;
}

/**
 * Everything the machine remembers about one note, persisted between looks.
 *
 * `repo` and `slug` are copied off the note on the first look rather than
 * read from it every time, because the ceiling has to be counted across
 * *other* records without opening every note to find out what each one was
 * about.
 */
export interface PlanRecord extends WorkRecord {
  /** Narrowed from the core's plain label to this workflow's own states. */
  state: PlanState;
  /** The repository the note is about, as `owner/name`. */
  repo?: string;
  /** The name the plan file and the branch both take. */
  slug?: string;
  lastDraft?: AttemptOutcome;
  lastCheck?: AttemptOutcome;
  /** What the pull request is opened with, worked out when the note reaches `PR_OPEN`: its call is passed this. */
  opening?: PullRequestInput;
  pullRequestNumber?: number;
  /** What the code host said when it would not open the pull request. */
  refusal?: string;
}

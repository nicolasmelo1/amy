import { Plan, act, advance, attemptsIn, looksIn, settled, wait } from "@amykit/core";
import { Observation, Policy } from "./observation.js";
import { PlanRecord } from "./record.js";

export type PlanState = "NOTED" | "DRAFTED" | "CHECKED" | "PR_OPEN" | "DONE" | "DECLINED";
export type Effect =
  | { type: "draft-plan"; finding?: string }
  | { type: "check-plan" }
  | { type: "open-pull-request" }
  | { type: "announce"; text: string };

type Decision = (record: PlanRecord, observation: Observation, policy: Policy) => Plan;

export const decide = {
  NOTED: planNoted,
  DRAFTED: (record, _observation, policy) => planDrafted(record, policy),
  CHECKED: (record) => planChecked(record),
  PR_OPEN: (_record, observation) => planPullRequestOpen(observation),
  DONE: () => settled("the plan is on a pull request, and merging it is somebody else's call"),
  DECLINED: () => settled("nothing was written, and the operator was told why"),
} satisfies Record<PlanState, Decision>;

/**
 * Decides the single next move for one note.
 *
 * Pure on purpose, and short on purpose: nothing in this lifecycle waits on a
 * person. The one thing it holds for is the ceiling on how many plans it may
 * have in flight, and that is a number rather than somebody's answer.
 */
export function plan(record: PlanRecord, obs: Observation, policy: Policy): Plan {
  return decide[record.state](record, obs, policy);
}

function planNoted(record: PlanRecord, obs: Observation, policy: Policy): Plan {
  // Three repositories are the ones this work already lives in, and a note
  // about anything else is a note the operator gets told about instead. It is
  // not a failure and it is not retried: nothing about waiting would make an
  // unwritable repository writable.
  if (!obs.writable) {
    return advance(
      "DECLINED",
      `${obs.note.repo} is not a repository I write plans into`,
      {
        type: "announce",
        text:
          `A note came in about ${obs.note.repo}, which I do not write plans into. ` +
          `It is yours to place: ${obs.note.text}`,
      },
    );
  }

  // Held before anything is drafted rather than before the pull request is
  // opened, because an agent spent on a plan that cannot land is spent for
  // nothing.
  if (obs.plansInFlight >= policy.maxOpenPlansPerRepo) {
    const firstLook = looksIn(record, "NOTED") === 0;
    return wait(
      policy.ceilingBackoffMs,
      `${obs.plansInFlight} plan(s) are already in flight for ${obs.note.repo}`,
      ...(firstLook
        ? ([
            {
              type: "announce" as const,
              text:
                `I am holding a note about ${obs.note.repo}: ` +
                `${obs.plansInFlight} plan(s) of mine are already open there and nobody has ` +
                `read them yet. Merge or close one and I will pick this up.`,
            },
          ] as const)
        : []),
    );
  }

  return advance("DRAFTED", "the note is about a repository I can write a plan into");
}

/**
 * A draft only counts as current if it happened after the last check.
 *
 * Without that, a red check would bounce back into DRAFTED, find the previous
 * successful attempt still recorded, and return to the check forever.
 */
function draftIsCurrent(record: PlanRecord): boolean {
  const draft = record.lastDraft;
  if (!draft) return false;
  if (!record.lastCheck) return true;
  return draft.at > record.lastCheck.at;
}

function checkIsCurrent(record: PlanRecord): boolean {
  const check = record.lastCheck;
  if (!check) return false;
  if (!record.lastDraft) return true;
  return check.at > record.lastDraft.at;
}

/** What the agent is told went wrong, when something did. */
function findingFor(record: PlanRecord): string | undefined {
  if (record.lastCheck && !record.lastCheck.ok && checkIsCurrent(record)) {
    return record.lastCheck.output;
  }
  if (record.lastDraft && !record.lastDraft.ok) return record.lastDraft.output;
  return undefined;
}

function planDrafted(record: PlanRecord, policy: Policy): Plan {
  if (draftIsCurrent(record) && record.lastDraft?.ok) {
    return advance("CHECKED", "the agent wrote a plan, the repository decides if it holds");
  }

  const attempts = attemptsIn(record, "DRAFTED");
  if (attempts >= policy.maxDraftAttempts) {
    return advance(
      "DECLINED",
      `${attempts} draft(s) could not get past the repository's own check`,
      {
        type: "announce",
        text:
          `I could not write a plan ${record.repo ?? "that repository"} would accept, ` +
          `across ${attempts} attempt(s). The last thing it said:\n` +
          `${record.lastCheck?.output ?? record.lastDraft?.output ?? "nothing"}`,
      },
    );
  }

  return act(`draft attempt ${attempts + 1}`, {
    type: "draft-plan",
    finding: findingFor(record),
  });
}

function planChecked(record: PlanRecord): Plan {
  if (!checkIsCurrent(record)) {
    return act("the check has not run against this draft", { type: "check-plan" });
  }

  if (record.lastCheck?.ok) {
    return advance("PR_OPEN", "the repository's own check is green");
  }

  // No effect here on purpose. DRAFTED sees that the check ran after the last
  // draft, so it acts again and picks the finding up as its context. That
  // keeps every retry counted in exactly one place.
  return advance("DRAFTED", "the check is red, back to the agent with the finding");
}

function planPullRequestOpen(obs: Observation): Plan {
  if (obs.pullRequest) {
    return advance("DONE", `pull request #${obs.pullRequest.number} carries the plan`);
  }
  return act("the branch has no pull request yet", { type: "open-pull-request" });
}

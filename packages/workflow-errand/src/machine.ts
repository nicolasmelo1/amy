import { Plan, Workflow } from "@amy/core";
import { USES_ACTIONS, act, advance, settled, wait } from "./effects.js";
import { Observation, Policy } from "./observation.js";
import { ErrandRecord, attemptsIn } from "./record.js";
import { ERRAND_STATES, WAITING_STATES } from "./state.js";

/**
 * Decides the single next move for one task.
 *
 * Pure, and short: an errand is the simplest thing this machine does. What
 * makes it worth a workflow rather than a script is the two ends — a ceiling
 * on how many it may have in flight, and the fact that "it was a question,
 * not a change" is a finished errand rather than a failed one.
 */
export function plan(record: ErrandRecord, obs: Observation, policy: Policy): Plan {
  switch (record.state) {
    case "QUEUED":
      return planQueued(record, obs, policy);
    case "WORKING":
      return planWorking(record, obs, policy);
    case "PR_OPEN":
      return planPullRequestOpen(obs);
    case "DONE":
      return settled("the errand is done, and whoever asked was told");
    case "DECLINED":
      return settled("nothing was done, and the operator was told why");
  }
}

function planQueued(record: ErrandRecord, obs: Observation, policy: Policy): Plan {
  // A task about a repository this install does not work in is not a failure
  // and is not retried: nothing about waiting would make it workable.
  if (!obs.workable) {
    return advance("DECLINED", `${obs.task.repo} is not a repository I work in`, {
      type: "announce",
      text:
        `Somebody asked for this in ${obs.task.repo}, which I do not work in. ` +
        `It is yours: ${obs.task.text}`,
    });
  }

  // Held before an agent is spent rather than before the pull request is
  // opened. `amy btw` is meant to cost nothing, and the failure that follows
  // from that is a pile of open pull requests nobody asked to review.
  if (obs.inFlight >= policy.maxInFlight) {
    const firstLook = attemptsIn(record, "QUEUED") === 0;
    return wait(
      policy.ceilingBackoffMs,
      `${obs.inFlight} errand(s) are already in flight`,
      ...(firstLook
        ? ([
            {
              type: "announce" as const,
              text:
                `I am holding an errand: ${obs.inFlight} of mine are already in flight ` +
                `and nobody has looked at them. Land one and I will pick this up.\n\n` +
                `Waiting: ${obs.task.text}`,
            },
          ] as const)
        : []),
    );
  }

  return advance("WORKING", "the task is about a repository I work in");
}

function planWorking(record: ErrandRecord, obs: Observation, policy: Policy): Plan {
  if (record.lastAttempt?.ok) {
    // An errand that answered a question rather than changing a file is
    // finished. Treating a clean tree as a failure is what would make this
    // useless for half of what people say in passing.
    if (!record.changed) {
      return advance("DONE", "the errand was a question, and it has an answer", {
        type: "announce",
        text: `Done, and it changed nothing:\n\n${obs.task.text}\n\n${record.lastAttempt.output}`,
      });
    }
    return advance("PR_OPEN", "the errand changed something, so it needs a pull request");
  }

  const attempts = attemptsIn(record, "WORKING");
  if (attempts >= policy.maxAttempts) {
    return advance("DECLINED", `${attempts} attempt(s) did not get it done`, {
      type: "announce",
      text:
        `I could not do this across ${attempts} attempt(s):\n\n${obs.task.text}\n\n` +
        `The last thing it said:\n${record.lastAttempt?.output ?? "nothing"}`,
    });
  }

  return act(`attempt ${attempts + 1}`, {
    type: "run-errand",
    finding: record.lastAttempt?.ok === false ? record.lastAttempt.output : undefined,
  });
}

function planPullRequestOpen(obs: Observation): Plan {
  if (obs.pullRequest) {
    return advance("DONE", `pull request #${obs.pullRequest.number} carries the errand`, {
      type: "announce",
      text: `Done, on pull request #${obs.pullRequest.number}:\n\n${obs.task.text}`,
    });
  }
  return act("the branch has no pull request yet", { type: "open-pull-request" });
}

/**
 * The workflow as the core mounts it.
 *
 * The third one, and the shortest. What it demonstrates is not a new
 * capability: it is that the third workflow cost a package rather than a
 * change to anything the first two use.
 */
export const errand: Workflow<Observation, Policy> = {
  name: "errand",
  states: ERRAND_STATES,
  waitingStates: WAITING_STATES,
  initialState: "QUEUED",
  terminalStates: ["DONE", "DECLINED"],
  usesActions: USES_ACTIONS,
  usesObservers: [],
  plan: (record, observation, policy) => plan(record as ErrandRecord, observation, policy),
};

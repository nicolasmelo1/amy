import {
  ActionContext,
  baseBranchFor,
  Moved,
  RepoLayout,
  Store,
  WorkflowActionScope,
  WorkflowPieceContext,
  unitOf,
} from "@amykit/core";
import type { PullRequestInput } from "@amykit/workflow-pull-request";
import type { Effect } from "./decide.js";
import { Observation, Policy } from "./observation.js";
import { EffectOutcomes } from "./outcomes.js";
import { ErrandRecord } from "./record.js";
import { Task } from "./ports/Tasks.js";
import type { configSchema, needs } from "./plugin.js";
import { branchFor, pullRequestBody, pullRequestTitle, slugFor } from "./task-file.js";
import { declinedIn, errandPrompt } from "./prompt.js";

/** What the declaration hands every piece: the mounted ports, the settings and the policy. */
type Scope = WorkflowPieceContext<typeof configSchema, Policy, typeof needs>;
type ActionScope = WorkflowActionScope<typeof configSchema, Policy, typeof needs>;
type Work = ActionContext<ErrandRecord, Observation>;

/** States where an errand is on its way somewhere, or already waiting. */
const IN_FLIGHT = ["WORKING", "PR_OPEN"];

/** Every task on the queue's directory is an errand to look at. */
export async function discover(scope: Scope): Promise<string[]> {
  return scope.ports.tasks.all().map((task) => task.id);
}

export async function observe(scope: Scope, current: ErrandRecord): Promise<Observation> {
  const task = scope.ports.tasks.get(unitOf(current));
  if (!task) throw new Error(`the task ${unitOf(current)} is not in the tasks directory any more`);

  return {
    task,
    workable: scope.config.repos.includes(task.repo),
    inFlight: inFlightExcept(scope.ports.store, unitOf(current)),
    now: scope.ctx.now(),
  };
}

/**
 * The errand itself: the agent does it on its own branch, and what it left is
 * committed and published only when there is something to review.
 */
export async function runErrand(
  scope: ActionScope,
  work: Work,
  effect: Extract<Effect, { type: "run-errand" }>,
): Promise<void> {
  const { git, layout } = scope.checkouts;
  const outcomes = work.outcomes as EffectOutcomes;
  const { task } = work.observation;
  const slug = slugFor(task);
  await git.prepareBranch(task.repo, branchFor(slug), task.id);

  const reply = await scope.ports.agent.ask(
    errandPrompt(task, effect.finding),
    git.pathFor(task.repo, task.id),
    { workId: work.record.id, step: "run-errand" },
  );

  const at = scope.ctx.now().toISOString();
  if (reply.run.outcome !== "completed") {
    outcomes.attempt = { ok: false, output: reply.run.output, at };
    return;
  }

  // A refusal is the agent's decision, and nothing it left in the tree is
  // published. What it left is stashed under the task's id rather than
  // committed, so no branch a later errand reuses carries it.
  const declined = declinedIn(reply.text);
  if (declined) {
    outcomes.attempt = { ok: true, output: reply.run.output, at };
    outcomes.declined = declined;
    // The refusal stands even when the tree cannot be cleaned; the
    // operator is told what is still in the checkout instead.
    try {
      await git.setAside(task.repo, `amy: what the refused errand ${task.id} left behind`, task.id);
    } catch (error) {
      const said = error instanceof Error ? error.message : String(error);
      outcomes.declined = `${declined}\n\nWhat it left in the checkout could not be set aside: ${said}`;
    }
    return;
  }

  // Whether the errand left something to review is a question about
  // commits, not about refs. `prepareBranch` already created a branch,
  // and publishing it for the first time is a new remote ref whether or
  // not it carries a commit — so "the push moved something" answered
  // yes for every errand that was a question, and opened a pull request
  // with no diff in it.
  const committed = await git.commit(task.repo, `chore: ${pullRequestTitle(task).toLowerCase()}`, task.id);
  const changed = committed || (await git.commitsAhead(task.repo, baseBranchFor(layout, task.repo), task.id)) > 0;

  // Nothing to publish is a finished errand, not a failed one: pushing a
  // branch that carries no commit only creates a pull request nobody can
  // act on.
  if (changed) await git.push(task.repo, branchFor(slug), task.id);

  outcomes.attempt = { ok: true, output: reply.run.output, at };
  outcomes.changed = changed;
}

/** Folds what the actions produced, and what the call at `PR_OPEN` is opened with. */
export function remember(
  scope: Scope,
  current: ErrandRecord,
  outcomes: Record<string, unknown>,
  observation: Observation,
  moved: Moved | null,
): ErrandRecord {
  const bag = outcomes as EffectOutcomes;
  const next: ErrandRecord = {
    ...current,
    repo: current.repo ?? observation.task.repo,
    slug: current.slug ?? slugFor(observation.task),
    ...(bag.attempt ? { lastAttempt: bag.attempt } : {}),
    ...(bag.changed === undefined ? {} : { changed: bag.changed }),
    ...(bag.declined === undefined ? {} : { declined: bag.declined }),
  };
  // The call's input is read off the record, and the body carries what
  // the agent said, so it is worked out on the move that makes the call.
  return moved?.to === "PR_OPEN"
    ? { ...next, opening: openingFor(observation.task, next, scope.checkouts.layout), asked: observation.task.text }
    : next;
}

/** What the pull request for an errand is opened with. */
function openingFor(task: Task, record: ErrandRecord, layout: RepoLayout): PullRequestInput {
  return {
    repo: task.repo,
    branch: branchFor(slugFor(task)),
    title: pullRequestTitle(task),
    base: baseBranchFor(layout, task.repo),
    body: pullRequestBody(task, record.lastAttempt?.output ?? ""),
  };
}

/** How many other errands are on their way somewhere right now. */
function inFlightExcept(records: Store<ErrandRecord>, exceptId: string): number {
  return records.all().filter((one) => one.id !== exceptId && IN_FLIGHT.includes(one.state)).length;
}

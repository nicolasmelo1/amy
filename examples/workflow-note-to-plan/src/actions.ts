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
import { EffectOutcomes, applyOutcomes } from "./outcomes.js";
import { PlanRecord } from "./record.js";
import { Note } from "./ports/Notes.js";
import type { configSchema, needs } from "./plugin.js";
import { branchFor, pullRequestBody, pullRequestTitle, slugFor } from "./plan-file.js";
import { draftPrompt } from "./prompt.js";

/**
 * What the declaration hands every piece. Everything here names a note, a
 * plan file or a repository; what drives it is the same engine that drives
 * the ticket workflow, which had to learn nothing to do it.
 */
type Scope = WorkflowPieceContext<typeof configSchema, Policy, typeof needs>;
type ActionScope = WorkflowActionScope<typeof configSchema, Policy, typeof needs>;
type Work = ActionContext<PlanRecord, Observation>;

/** States where a plan is on its way to a pull request, or already is one. */
const IN_FLIGHT = ["DRAFTED", "CHECKED", "PR_OPEN"];

/** Every note somebody wrote down, except the machine's reports on itself. */
export async function discover(scope: Scope): Promise<string[]> {
  return scope.ports.notes.all().filter(plannable).map((note) => note.id);
}

export async function observe(scope: Scope, current: PlanRecord): Promise<Observation> {
  const note = scope.ports.notes.get(unitOf(current));
  if (!note) throw new Error(`the note ${unitOf(current)} is not in the notes directory any more`);

  return {
    note,
    writable: scope.config.repos.includes(note.repo),
    plansInFlight: inFlightFor(scope.ports.store, note.repo, current.id),
    now: scope.ctx.now(),
  };
}

/**
 * The agent writes the plan on its own branch, through the same mounted port
 * the ticket workflow reaches for `triage` and `implement` — which is what
 * puts these prompts on the same ladder and under the same ceiling.
 */
export async function draftPlan(
  scope: ActionScope,
  work: Work,
  effect: Extract<Effect, { type: "draft-plan" }>,
): Promise<void> {
  const { git } = scope.checkouts;
  const outcomes = work.outcomes as EffectOutcomes;
  const { note } = work.observation;
  const slug = slugFor(note);
  await git.prepareBranch(note.repo, branchFor(slug), note.id);

  const reply = await scope.ports.agent.ask(
    draftPrompt(note, slug, effect.finding),
    git.pathFor(note.repo, note.id),
    { workId: work.record.id, step: "draft-plan" },
  );

  const at = scope.ctx.now().toISOString();
  if (reply.run.outcome !== "completed") {
    outcomes.draft = { ok: false, output: reply.run.output, at };
    return;
  }

  // A run that changed nothing is a failure here rather than a success:
  // the machine's notion of "drafted" means the plan is on the remote,
  // because that is what a pull request can be opened against.
  const pushed = await git.commitAndPush(note.repo, branchFor(slug), `docs(plans): ${slug.replace(/-/g, " ")}`, note.id);

  outcomes.draft = pushed
    ? { ok: true, output: reply.run.output, at }
    : { ok: false, output: `the agent finished without writing any file\n\n${reply.run.output}`, at };
}

/**
 * The plan is judged where it was written: with a worktree port behind the
 * Git, that is the note's own tree.
 */
export async function checkPlan(scope: ActionScope, work: Work): Promise<void> {
  (work.outcomes as EffectOutcomes).check = await scope.ports["plan-check"].check(
    work.observation.note.repo,
    work.observation.note.id,
  );
}

/**
 * Only this workflow's own half of the fold: the engine has already put the
 * record through `applyPlan`.
 *
 * The repository and the slug are copied off the note rather than produced
 * by an action, so they are folded here. Without them on the record, counting
 * what is in flight for a repository would mean opening every other note to
 * find out what it was about.
 */
export function remember(
  scope: Scope,
  current: PlanRecord,
  outcomes: Record<string, unknown>,
  observation: Observation,
  moved: Moved | null,
): PlanRecord {
  const next = applyOutcomes(current, {
    ...(outcomes as EffectOutcomes),
    repo: observation.note.repo,
    slug: slugFor(observation.note),
  });
  // The call's input is read off the record, and the body is the note's
  // own words, so it is worked out on the move that makes the call.
  return moved?.to === "PR_OPEN" ? { ...next, opening: openingFor(observation.note, scope.checkouts.layout) } : next;
}

/** What the pull request for a note is opened with. */
function openingFor(note: Note, layout: RepoLayout): PullRequestInput {
  const slug = slugFor(note);
  return {
    repo: note.repo,
    branch: branchFor(slug),
    title: pullRequestTitle(slug),
    base: baseBranchFor(layout, note.repo),
    // Written out, unlike the ticket workflow's. There is no ticket behind
    // this one to be the description.
    body: pullRequestBody(note, slug),
  };
}

/** Plans already on their way to a pull request for one repository. */
function inFlightFor(records: Store<PlanRecord>, repo: string, except: string): number {
  return records.all().filter((other) => {
    if (other.id === except) return false;
    return other.repo === repo && IN_FLIGHT.includes(other.state);
  }).length;
}

/** A note the machine wrote about a failure of its own. */
const FAILURE_REPORT = "a tick that failed in";

/**
 * Whether a note is work this workflow should take, or a report of its own.
 *
 * The machine files friction when a tick gives up. That note is written, is
 * counted, and is read by a person — and it is not itself planned: a plan
 * that fails would file another note, which would be planned, which could
 * fail, and the machine would keep opening pull requests about its own
 * reports. What a person can do, a person decides to.
 */
function plannable(note: Note): boolean {
  return !note.source.startsWith(FAILURE_REPORT);
}

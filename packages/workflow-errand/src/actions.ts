import {
  ActionContext,
  ActionHandler,
  baseBranchFor,
  CodeHost,
  Git,
  Harness,
  Notifier,
  RepoLayout,
  Store,
  WorkflowRuntimeParts,
} from "@amykit/core";
import type { Effect } from "./decide.js";
import { Observation, Policy } from "./observation.js";
import { EffectOutcomes } from "./outcomes.js";
import { ErrandRecord } from "./record.js";
import { Task, Tasks } from "./ports/Tasks.js";
import { branchFor, pullRequestBody, pullRequestTitle, slugFor } from "./task-file.js";
import { declinedIn, errandPrompt } from "./prompt.js";

export interface ErrandRuntimeConfig {
  /** The repositories this install may do an errand in. */
  repos: readonly string[];
}

export interface ErrandRuntimeDeps {
  tasks: Tasks;
  /** The same mounted port the other workflows reach, at its generic level. */
  agent: Harness;
  host: CodeHost;
  notifier: Notifier;
  git: Git;
  /**
   * The layout the `Git` above resolves, named for the one question `Git`
   * does not answer: what a repository's pull request opens against.
   */
  layout: RepoLayout;
  /** Read to count what is already in flight, never written to here. */
  records: Store<ErrandRecord>;
  now: () => Date;
  config: ErrandRuntimeConfig;
  policy: Policy;
}

type Context = ActionContext<ErrandRecord, Observation>;

/** Exhaustive over this workflow's actions, checked at compile time. */
type ErrandHandlers = {
  [K in Effect["type"]]: (effect: Extract<Effect, { type: K }>, ctx: Context) => Promise<void>;
};

/** States where an errand is on its way somewhere, or already waiting. */
const IN_FLIGHT = ["WORKING", "PR_OPEN"];

export function errandRuntime(
  deps: ErrandRuntimeDeps,
): WorkflowRuntimeParts<ErrandRecord, Observation> {
  const requireTask = (workId: string): Task => {
    const found = deps.tasks.get(workId);
    if (!found) throw new Error(`the task ${workId} is not in the tasks directory any more`);
    return found;
  };

  const outcomesOf = (ctx: Context): EffectOutcomes => ctx.outcomes as EffectOutcomes;

  const handlers: ErrandHandlers = {
    "run-errand": async (effect, ctx) => {
      const { task } = ctx.observation;
      const slug = slugFor(task);
      await deps.git.prepareBranch(task.repo, branchFor(slug), task.id);

      const reply = await deps.agent.ask(
        errandPrompt(task, effect.finding),
        deps.git.pathFor(task.repo, task.id),
        { workId: ctx.record.id, step: "run-errand" },
      );

      const at = deps.now().toISOString();
      if (reply.run.outcome !== "completed") {
        outcomesOf(ctx).attempt = { ok: false, output: reply.run.output, at };
        return;
      }

      // A refusal is the agent's decision, and nothing it left in the tree is
      // published: it was asked to change nothing.
      const declined = declinedIn(reply.text);
      if (declined) {
        outcomesOf(ctx).attempt = { ok: true, output: reply.run.output, at };
        outcomesOf(ctx).declined = declined;
        return;
      }

      // Whether the errand left something to review is a question about
      // commits, not about refs. `prepareBranch` already created a branch,
      // and publishing it for the first time is a new remote ref whether or
      // not it carries a commit — so "the push moved something" answered
      // yes for every errand that was a question, and opened a pull request
      // with no diff in it.
      const committed = await deps.git.commit(
        task.repo,
        `chore: ${pullRequestTitle(task).toLowerCase()}`,
        task.id,
      );
      const changed =
        committed ||
        (await deps.git.commitsAhead(task.repo, baseBranchFor(deps.layout, task.repo), task.id)) > 0;

      // Nothing to publish is a finished errand, not a failed one: pushing a
      // branch that carries no commit only creates a pull request nobody can
      // act on.
      if (changed) await deps.git.push(task.repo, branchFor(slug), task.id);

      outcomesOf(ctx).attempt = { ok: true, output: reply.run.output, at };
      outcomesOf(ctx).changed = changed;
    },

    "open-pull-request": async (_effect, ctx) => {
      const { task } = ctx.observation;

      outcomesOf(ctx).pullRequestNumber = await deps.host.openPullRequest({
        repo: task.repo,
        branch: branchFor(slugFor(task)),
        title: pullRequestTitle(task),
        base: baseBranchFor(deps.layout, task.repo),
        body: pullRequestBody(task, ctx.record.lastAttempt?.output ?? ""),
        // A draft, because nobody asked for this at the moment it landed.
        // Work somebody is waiting on is not a draft; an errand is something
        // to look at when you want to.
        draft: true,
      });
    },

    // Standalone, a word the operator was owed fails the action; mounted, the
    // plugin hands this to the host's best-effort `announce` instead.
    "announce": async (effect, ctx) => {
      await deps.notifier.announce({ text: effect.text, workId: ctx.record.id, state: ctx.record.state });
    },
  };

  return {
    async found() {
      return deps.tasks.all().map((task) => task.id);
    },

    async observe(current) {
      const task = requireTask(current.id);

      // Only asked where it is used, so an errand being worked on does not
      // call the code host once per look for a pull request that cannot
      // exist yet.
      const pullRequest =
        current.state === "PR_OPEN"
          ? await deps.host.findPullRequest(task.repo, branchFor(slugFor(task)))
          : null;

      return {
        task,
        workable: deps.config.repos.includes(task.repo),
        inFlight: inFlightExcept(deps.records, current.id),
        pullRequest,
        now: deps.now(),
      };
    },

    // The key is the declaration and the value what runs it. The cast is the
    // boundary: the map is exhaustive over `Effect`, so a new action fails to
    // compile until something runs it, and the engine only ever hands back an
    // action it was given by the plan that typed it.
    actions: Object.fromEntries(
      Object.entries(handlers).map(([name, handler]) => [
        name,
        handler as ActionHandler<ErrandRecord, Observation>,
      ]),
    ),

    apply(current, _plan, outcomes, observation) {
      const bag = outcomes as EffectOutcomes;
      return {
        ...current,
        repo: current.repo ?? observation.task.repo,
        slug: current.slug ?? slugFor(observation.task),
        ...(bag.attempt ? { lastAttempt: bag.attempt } : {}),
        ...(bag.changed === undefined ? {} : { changed: bag.changed }),
        ...(bag.declined === undefined ? {} : { declined: bag.declined }),
        ...(bag.pullRequestNumber === undefined
          ? {}
          : { pullRequestNumber: bag.pullRequestNumber }),
      };
    },
  };
}

/** How many other errands are on their way somewhere right now. */
function inFlightExcept(records: Store<ErrandRecord>, exceptId: string): number {
  return records.all().filter((one) => one.id !== exceptId && IN_FLIGHT.includes(one.state)).length;
}

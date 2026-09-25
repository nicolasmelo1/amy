import {
  ActionContext,
  ActionHandler,
  AgentRun,
  baseBranchFor,
  CodeHost,
  Event,
  EventKind,
  EventLog,
  Git,
  Harness,
  Notifier,
  RepoLayout,
  Store,
  WorkflowRuntime,
} from "@amykit/core";
import { Effect } from "./effects.js";
import { Observation, Policy } from "./observation.js";
import { EffectOutcomes } from "./outcomes.js";
import { ErrandRecord, newRecord } from "./record.js";
import { Task, Tasks } from "./ports/Tasks.js";
import { branchFor, pullRequestBody, pullRequestTitle, slugFor } from "./task-file.js";
import { errandPrompt } from "./prompt.js";

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
  log?: EventLog;
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
): WorkflowRuntime<ErrandRecord, Observation> {
  const record = (kind: EventKind, rest: Omit<Event, "at" | "kind"> = {}): void => {
    try {
      deps.log?.append({ at: deps.now().toISOString(), kind, ...rest });
    } catch {
      // The engine is what tells the operator its log is broken; two voices
      // for one outage is one too many.
    }
  };

  const announce = async (text: string, ctx: Context): Promise<void> => {
    try {
      await deps.notifier.announce({ text, workId: ctx.record.id, state: ctx.record.state });
    } catch (error) {
      record("notify.failed", {
        workId: ctx.record.id,
        state: ctx.record.state,
        detail: { error: error instanceof Error ? error.message : String(error), text },
      });
    }
  };

  const recordAgentRun = (ctx: Context, run: AgentRun): void => {
    record("agent.run", {
      workId: ctx.record.id,
      state: ctx.record.state,
      detail: {
        harness: run.harness,
        model: run.model,
        outcome: run.outcome,
        durationMs: run.durationMs,
        costSource: run.costSource,
        ...(run.costUsd === undefined ? {} : { costUsd: run.costUsd }),
        ...(run.tokens === undefined ? {} : { tokens: { ...run.tokens } }),
      },
    });
  };

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
      recordAgentRun(ctx, reply.run);

      const at = deps.now().toISOString();
      if (reply.run.outcome !== "completed") {
        outcomesOf(ctx).attempt = { ok: false, output: reply.run.output, at };
        return;
      }

      // Pushing is what decides whether this was a change or an answer, and
      // both are successes. A clean tree here means the agent read something
      // and told us; treating that as a failure would make the errand useless
      // for half of what people say in passing.
      const pushed = await deps.git.commitAndPush(
        task.repo,
        branchFor(slug),
        `chore: ${pullRequestTitle(task).toLowerCase()}`,
        task.id,
      );

      outcomesOf(ctx).attempt = { ok: true, output: reply.run.output, at };
      outcomesOf(ctx).changed = pushed;
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

    "announce": async (effect, ctx) => {
      await announce(effect.text, ctx);
    },
  };

  return {
    policy: deps.policy,

    async found() {
      return deps.tasks.all().map((task) => task.id);
    },

    newRecord,

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

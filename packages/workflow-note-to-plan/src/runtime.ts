import {
  ActionContext,
  ActionHandler,
  AgentRun,
  CodeHost,
  Event,
  EventKind,
  EventLog,
  Git,
  Harness,
  Notifier,
  Plan,
  Store,
  WorkflowRuntime,
} from "@amy/core";
import { Effect } from "./effects.js";
import { Observation, Policy } from "./observation.js";
import { EffectOutcomes, applyOutcomes } from "./outcomes.js";
import { PlanRecord, newRecord } from "./record.js";
import { Note, Notes } from "./ports/Notes.js";
import { PlanCheck } from "./ports/PlanCheck.js";
import { branchFor, pullRequestBody, pullRequestTitle, slugFor } from "./plan-file.js";
import { draftPrompt } from "./prompt.js";

export interface PlanRuntimeConfig {
  /** The repositories this install may write a plan into. */
  repos: readonly string[];
}

export interface PlanRuntimeDeps {
  notes: Notes;
  /**
   * The agent, as the only thing it is asked for here: a prompt, a directory
   * and an account of what the answer cost.
   *
   * The same mounted port the ticket workflow reaches for `triage` and
   * `implement`, narrowed to the half with no vocabulary in it. That is what
   * puts these prompts on the same ladder and under the same ceiling as the
   * first workflow's, with neither knowing about the other.
   */
  agent: Harness;
  check: PlanCheck;
  host: CodeHost;
  notifier: Notifier;
  git: Git;
  /** Read to count what is already in flight, never written to here. */
  records: Store<PlanRecord>;
  now: () => Date;
  config: PlanRuntimeConfig;
  policy: Policy;
  /** Optional, so a runtime with no log still runs. */
  log?: EventLog;
}

type Context = ActionContext<PlanRecord, Observation>;

/** Exhaustive over this workflow's actions, checked at compile time. */
type PlanHandlers = {
  [K in Effect["type"]]: (effect: Extract<Effect, { type: K }>, ctx: Context) => Promise<void>;
};

/** States where a plan is on its way to a pull request, or already is one. */
const IN_FLIGHT = ["DRAFTED", "CHECKED", "PR_OPEN"];

/**
 * How this workflow's actions run: what the world looks like before a
 * decision, what each action does, and how the result folds back in.
 *
 * Everything here names a note, a plan file or a repository. What it is
 * driven by is the same engine that drives the ticket workflow, which had to
 * learn nothing to do it.
 */
export function planRuntime(deps: PlanRuntimeDeps): WorkflowRuntime<PlanRecord, Observation> {
  /** Appends to the log if there is one, and shrugs if it throws. */
  const record = (kind: EventKind, rest: Omit<Event, "at" | "kind"> = {}): void => {
    try {
      deps.log?.append({ at: deps.now().toISOString(), kind, ...rest });
    } catch {
      // The engine is what tells the operator its log is broken; two voices
      // for one outage is one too many.
    }
  };

  /** Says something to the operator, and never lets that cost a note. */
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

  const requireNote = (workId: string): Note => {
    const found = deps.notes.get(workId);
    if (!found) {
      throw new Error(`the note ${workId} is not in the notes directory any more`);
    }
    return found;
  };

  /** The outcomes bag, typed at the one boundary that knows what is in it. */
  const outcomesOf = (ctx: Context): EffectOutcomes => ctx.outcomes as EffectOutcomes;

  const handlers: PlanHandlers = {
    "draft-plan": async (effect, ctx) => {
      const { note } = ctx.observation;
      const slug = slugFor(note);
      await deps.git.prepareBranch(note.repo, branchFor(slug));

      const reply = await deps.agent.ask(
        draftPrompt(note, slug, effect.finding),
        deps.git.pathFor(note.repo),
        { workId: ctx.record.id, step: "draft-plan" },
      );
      recordAgentRun(ctx, reply.run);

      const at = deps.now().toISOString();
      if (reply.run.outcome !== "completed") {
        outcomesOf(ctx).draft = { ok: false, output: reply.run.output, at };
        return;
      }

      // A run that changed nothing is a failure here rather than a success:
      // the machine's notion of "drafted" means the plan is on the remote,
      // because that is what a pull request can be opened against.
      const pushed = await deps.git.commitAndPush(
        note.repo,
        branchFor(slug),
        `docs(plans): ${slug.replace(/-/g, " ")}`,
      );

      outcomesOf(ctx).draft = pushed
        ? { ok: true, output: reply.run.output, at }
        : {
            ok: false,
            output: `the agent finished without writing any file\n\n${reply.run.output}`,
            at,
          };
    },

    "check-plan": async (_effect, ctx) => {
      outcomesOf(ctx).check = await deps.check.check(ctx.observation.note.repo);
    },

    "open-pull-request": async (_effect, ctx) => {
      const { note } = ctx.observation;
      const slug = slugFor(note);

      outcomesOf(ctx).pullRequestNumber = await deps.host.openPullRequest({
        repo: note.repo,
        branch: branchFor(slug),
        title: pullRequestTitle(slug),
        // Written out, unlike the ticket workflow's. There is no ticket
        // behind this one to be the description.
        body: pullRequestBody(note, slug),
      });
    },

    "announce": async (effect, ctx) => {
      await announce(effect.text, ctx);
    },
  };

  return {
    policy: deps.policy,

    async found() {
      return deps.notes.all().map((note) => note.id);
    },

    newRecord,

    async observe(current) {
      const note = requireNote(current.id);
      const slug = slugFor(note);

      // Only asked where it is used, so a note being drafted does not call
      // the code host once per look for a pull request that cannot exist yet.
      const pullRequest =
        current.state === "PR_OPEN"
          ? await deps.host.findPullRequest(note.repo, branchFor(slug))
          : null;

      return {
        note,
        writable: deps.config.repos.includes(note.repo),
        plansInFlight: inFlightFor(deps.records, note.repo, current.id),
        pullRequest,
        now: deps.now(),
      };
    },

    handlers() {
      // The cast is the boundary. Inside this file the map is exhaustive over
      // `Effect` and each handler takes exactly its own payload, which is what
      // makes a new action fail to compile until something runs it.
      return Object.fromEntries(
        Object.entries(handlers).map(([name, handler]) => [
          name,
          handler as ActionHandler<PlanRecord, Observation>,
        ]),
      );
    },

    /**
     * Only this workflow's own half of the fold: the engine has already put
     * the record through `applyPlan`.
     *
     * The repository and the slug are copied off the note rather than
     * produced by an action, so they are folded here. Without them on the
     * record, counting what is in flight for a repository would mean opening
     * every other note to find out what it was about.
     */
    apply(current, _plan: Plan, outcomes, observation, _now) {
      return applyOutcomes(current, {
        ...(outcomes as EffectOutcomes),
        repo: observation.note.repo,
        slug: slugFor(observation.note),
      });
    },
  };
}

/** Plans already on their way to a pull request for one repository. */
function inFlightFor(records: Store<PlanRecord>, repo: string, except: string): number {
  return records.all().filter((other) => {
    if (other.id === except) return false;
    return other.repo === repo && IN_FLIGHT.includes(other.state);
  }).length;
}

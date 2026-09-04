import {
  CodeHost,
  ConfigSchema,
  Git,
  Harness,
  Notifier,
  Plan,
  Plugin,
  PluginContext,
  Store,
  WORKFLOW_RUNTIME,
  WorkflowRuntime,
} from "@amy/core";
import { noteToPlan } from "./machine.js";
import { DEFAULT_POLICY, Observation, Policy } from "./observation.js";
import { PlanRecord } from "./record.js";
import { Notes } from "./ports/Notes.js";
import { PlanCheck } from "./ports/PlanCheck.js";
import { planRuntime } from "./runtime.js";

export const configSchema: ConfigSchema = {
  repos: {
    type: "string[]",
    required: true,
    description: "the repositories a plan may be written into. A note about anything else is handed back to the operator",
  },
  defaultBranch: {
    type: "string",
    description: "the branch a plan branch is cut from, which is not always `main`",
    default: "main",
  },
  policy: {
    type: "record",
    description:
      "maxDraftAttempts, maxOpenPlansPerRepo and ceilingBackoffMs. Anything left out keeps its default",
    default: {},
  },
};

/**
 * The runtime built for one mount, keyed by that mount's context.
 *
 * The exported plugin is a module singleton, so a field on it would be shared
 * by every host in the process and the second mount would answer with the
 * first one's ports.
 */
const runtimes = new WeakMap<PluginContext, WorkflowRuntime<PlanRecord, Observation>>();

function runtimeFor(ctx: PluginContext): WorkflowRuntime<PlanRecord, Observation> {
  const existing = runtimes.get(ctx);
  if (existing) return existing;

  const built = planRuntime({
    notes: required<Notes>(ctx, "notes"),
    // The `agent` port, narrowed to the half that has no vocabulary in it.
    // The ticket workflow narrows the same port to its own three methods,
    // which is what "type safety comes from the workflow's side" means when
    // two workflows share one adapter.
    agent: required<Harness>(ctx, "agent"),
    check: required<PlanCheck>(ctx, "plan-check"),
    host: required<CodeHost>(ctx, "code-host"),
    notifier: required<Notifier>(ctx, "notifier"),
    records: required<Store<PlanRecord>>(ctx, "store"),
    git: new Git(ctx.runner, {
      workspaceRoot: ctx.paths.workspace,
      defaultBranch: ctx.config.defaultBranch as string,
    }),
    now: ctx.now,
    log: ctx.log,
    config: { repos: ctx.config.repos as string[] },
    policy: { ...DEFAULT_POLICY, ...(ctx.config.policy as Partial<Policy>) },
  });

  runtimes.set(ctx, built);
  return built;
}

/**
 * This workflow, as a plugin: the order its states happen in, and how each of
 * its actions runs.
 *
 * The same two halves the ticket workflow contributes, through the same seam,
 * to the same engine. Nothing in `plugins/serial-engine` changed to make this
 * one run, which is the claim the seam was built to be able to make.
 */
export const plugin: Plugin = {
  name: "@amy/workflow-note-to-plan",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    registry.workflow(noteToPlan);

    // Not built now: the ports it needs are mounted by plugins that may be
    // listed after this one, and mounting order should not be something an
    // operator has to get right. `ready` builds it while boot can still
    // refuse, and this is the fallback for a host that mounts without that
    // second pass.
    const lazily = (): WorkflowRuntime<PlanRecord, Observation> => runtimeFor(ctx);

    registry.contribute(WORKFLOW_RUNTIME, noteToPlan.name, {
      get policy(): unknown {
        return lazily().policy;
      },
      found: (): Promise<string[]> => lazily().found(),
      newRecord: (workId: string, now: Date): PlanRecord => lazily().newRecord(workId, now),
      observe: (record: PlanRecord): Promise<Observation> => lazily().observe(record),
      handlers: () => lazily().handlers(),
      apply: (
        record: PlanRecord,
        plan: Plan,
        outcomes: Record<string, unknown>,
        observation: Observation,
        now: Date,
      ): PlanRecord => lazily().apply(record, plan, outcomes, observation, now),
    } satisfies WorkflowRuntime<PlanRecord, Observation>);
  },

  /**
   * Builds the runtime while boot can still refuse.
   *
   * A missing port is an install that cannot turn a note into a plan, and it
   * costs a boot naming the port rather than somebody's note halfway through.
   */
  ready(ctx) {
    runtimeFor(ctx);
  },
};

/** A port this workflow cannot work without. */
function required<T>(ctx: PluginContext, kind: string): T {
  const port = ctx.port(kind);
  if (!port) {
    throw new Error(`the note-to-plan workflow needs the \`${kind}\` port, and nothing mounted it`);
  }
  return port as T;
}

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
} from "@amykit/core";
import { errand } from "./machine.js";
import { DEFAULT_POLICY, Observation, Policy } from "./observation.js";
import { ErrandRecord } from "./record.js";
import { Tasks } from "./ports/Tasks.js";
import { errandRuntime } from "./runtime.js";

export const configSchema: ConfigSchema = {
  repos: {
    type: "string[]",
    required: true,
    description:
      "the repositories an errand may be done in. A task about anything else is handed back to whoever asked",
  },
  defaultBranch: {
    type: "string",
    description: "the branch an errand branch is cut from, which is not always `main`",
    default: "main",
  },
  policy: {
    type: "record",
    description:
      "maxAttempts, maxInFlight and ceilingBackoffMs. Anything left out keeps its default",
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
const runtimes = new WeakMap<PluginContext, WorkflowRuntime<ErrandRecord, Observation>>();

function runtimeFor(ctx: PluginContext): WorkflowRuntime<ErrandRecord, Observation> {
  const existing = runtimes.get(ctx);
  if (existing) return existing;

  const built = errandRuntime({
    tasks: required<Tasks>(ctx, "tasks"),
    agent: required<Harness>(ctx, "agent"),
    host: required<CodeHost>(ctx, "code-host"),
    notifier: required<Notifier>(ctx, "notifier"),
    records: required<Store<ErrandRecord>>(ctx, "store"),
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
 * This workflow, as a plugin.
 *
 * The third one through the same seam, and the one that cost the least: no
 * new action, no new engine, nothing changed in either of the other two.
 */
export const plugin: Plugin = {
  name: "@amykit/workflow-errand",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    registry.workflow(errand);

    const lazily = (): WorkflowRuntime<ErrandRecord, Observation> => runtimeFor(ctx);

    registry.contribute(WORKFLOW_RUNTIME, errand.name, {
      get policy(): unknown {
        return lazily().policy;
      },
      found: (): Promise<string[]> => lazily().found(),
      newRecord: (workId: string, now: Date): ErrandRecord => lazily().newRecord(workId, now),
      observe: (record: ErrandRecord): Promise<Observation> => lazily().observe(record),
      handlers: () => lazily().handlers(),
      apply: (
        record: ErrandRecord,
        plan: Plan,
        outcomes: Record<string, unknown>,
        observation: Observation,
        now: Date,
      ): ErrandRecord => lazily().apply(record, plan, outcomes, observation, now),
    } satisfies WorkflowRuntime<ErrandRecord, Observation>);
  },

  ready(ctx) {
    runtimeFor(ctx);
  },
};

/** A port this workflow cannot work without. */
function required<T>(ctx: PluginContext, kind: string): T {
  const port = ctx.port(kind);
  if (!port) {
    throw new Error(`the errand workflow needs the \`${kind}\` port, and nothing mounted it`);
  }
  return port as T;
}

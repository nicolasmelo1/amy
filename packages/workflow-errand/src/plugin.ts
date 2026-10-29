import {
  CodeHost,
  ConfigSchema,
  Git,
  Harness,
  Notifier,
  definePlugin,
  PluginContext,
  Store,
  Worktree,
  WORKFLOW_RUNTIME,
  deferred,
  WorkflowRuntime,
  ConfigOf,
} from "@amykit/core";
import { errand } from "./machine.js";
import { DEFAULT_POLICY, Observation, Policy } from "./observation.js";
import { ErrandRecord } from "./record.js";
import { Tasks } from "./ports/Tasks.js";
import { errandRuntime } from "./runtime.js";

export const configSchema = {
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
  baseBranch: {
    type: "record",
    description:
      "where one repository's base branch is, instead of the fallback. A repository named here has its errand opened against that branch",
    default: {},
  },
  policy: {
    type: "record",
    description:
      "maxAttempts, maxInFlight and ceilingBackoffMs. Anything left out keeps its default",
    default: {},
  },
} satisfies ConfigSchema;

type TypedContext = PluginContext<ConfigOf<typeof configSchema>>;

/** The runtime for one mount, built by the host once every plugin has registered. */
function runtimeFor(ctx: TypedContext): WorkflowRuntime<ErrandRecord, Observation> {
  return errandRuntime({
    tasks: required<Tasks>(ctx, "tasks"),
    agent: required<Harness>(ctx, "agent"),
    host: required<CodeHost>(ctx, "code-host"),
    notifier: required<Notifier>(ctx, "notifier"),
    records: required<Store<ErrandRecord>>(ctx, "store"),
    git: new Git(
      ctx.runner,
      {
        workspaceRoot: ctx.paths.workspace,
        checkouts: ctx.paths.checkouts,
        defaultBranch: ctx.config.defaultBranch,
        baseBranch: ctx.config.baseBranch as Record<string, string> | undefined,
      },
      ctx.port("worktree") as Worktree | undefined,
    ),
    // The same layout, named for the question `Git` does not answer: what the
    // pull request opens against.
    layout: {
      workspaceRoot: ctx.paths.workspace,
      checkouts: ctx.paths.checkouts,
      defaultBranch: ctx.config.defaultBranch,
      baseBranch: ctx.config.baseBranch as Record<string, string> | undefined,
    },
    now: ctx.now,
    log: ctx.log,
    config: { repos: ctx.config.repos },
    policy: { ...DEFAULT_POLICY, ...(ctx.config.policy as Partial<Policy>) },
  });
}

/**
 * This workflow, as a plugin.
 *
 * The third one through the same seam, and the one that cost the least: no
 * new action, no new engine, nothing changed in either of the other two.
 */
export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/workflow-errand",
  configSchema,
  register(registry, ctx) {
    registry.workflow(errand);

    // Deferred: the ports it needs are mounted by plugins that may be listed
    // after this one. The host builds it once every plugin has registered, so
    // a port nobody mounted is refused at boot, naming the port.
    registry.contribute(WORKFLOW_RUNTIME, errand.name, deferred(() => runtimeFor(ctx)));
  },
});

/** A port this workflow cannot work without. */
function required<T>(ctx: TypedContext, kind: string): T {
  const port = ctx.port(kind);
  if (!port) {
    throw new Error(`the errand workflow needs the \`${kind}\` port, and nothing mounted it`);
  }
  return port as T;
}

import {
  Budget,
  Engine,
  Notifier,
  definePlugin,
  PluginContext,
  Queue,
  Store,
  WORKFLOW_RUNTIME,
  Workflow,
  WorkflowRuntime,
  deferred,
  ConfigOf,
} from "@amykit/core";
import { Worker } from "./Worker.js";
import { configSchema } from "./config.js";

type TypedContext = PluginContext<ConfigOf<typeof configSchema>>;

export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-serial-engine",
  configSchema,
  register(registry, ctx) {
    // Deferred: the workflow and the ports it needs are registered by plugins
    // that may be listed after this one. The host builds it once every plugin
    // has registered, so an engine with no workflow, or a workflow with no
    // queue, is refused at boot rather than on the first tick.
    registry.engine(deferred((): Engine => engineFor(ctx, "serial")));
  },
});

/**
 * The engine over the mounted workflow, its lanes moved one per look or side
 * by side. Exported for the concurrent engine, which is this one with its
 * lanes moved at once, so the two cannot drift apart on anything else.
 */
export function engineFor(ctx: PluginContext<ConfigOf<typeof configSchema>>, lanes: "serial" | "concurrent"): Engine {
  const worker = build(ctx, lanes);
  return { discover: () => worker.discover(), tick: () => worker.tick() };
}

function build(ctx: TypedContext, lanes: "serial" | "concurrent"): Worker {
  const workflow = ctx.workflow() as Workflow | undefined;
  if (!workflow) {
    throw new Error("the serial engine needs a workflow, and no plugin registered one");
  }

  // The pair first: a workflow with no runtime is an engine that cannot
  // mean anything, and saying so beats reporting a missing queue to somebody
  // whose real problem is a half-mounted workflow.
  const runtime = runtimeFor(ctx, workflow);
  if (!ctx.workflowPort) {
    throw new Error("the serial engine needs a core with workflow-scoped ports; upgrade @amykit/core");
  }

  return new Worker({
    queue: required<Queue>(ctx, "queue"),
    records: required<Store>(ctx, "store"),
    workflow,
    runtime,
    notifier: required<Notifier>(ctx, "notifier"),
    // For an action the workflow wired as a port and a method: the engine
    // calls it, so the engine is what has to reach the port.
    port: (kind) => ctx.workflowPort!(kind),
    now: ctx.now,
    log: ctx.log,
    // Optional: an install that set no ceiling mounts no budget, and this
    // engine then never asks one.
    budget: ctx.port("budget") as Budget | undefined,
    lanes,
    config: {
      staleClaimMs: ctx.config.staleClaimMs,
      retentionDays: ctx.config.retentionDays,
      maxItemAttempts: ctx.config.maxItemAttempts,
      retryDelayMs: ctx.config.retryDelayMs,
    },
  });
}

/**
 * The runtime the mounted workflow contributed.
 *
 * Looked up by the workflow's own name, so an install that mounts two
 * workflows and one runtime is refused here rather than driving the wrong
 * half of itself. Naming what there was to choose from, because a
 * mismatched pair is a config mistake and the fix is a name.
 */
function runtimeFor(ctx: TypedContext, workflow: Workflow): WorkflowRuntime {
  const contributed = ctx.contributions(WORKFLOW_RUNTIME);
  const runtime = contributed.get(workflow.name);

  if (!runtime) {
    const offered = [...contributed.keys()].join(", ") || "nothing";
    throw new Error(
      `the workflow \`${workflow.name}\` contributed no runtime to \`${WORKFLOW_RUNTIME}\`, ` +
        `so nothing here knows how to run its actions. Contributed: ${offered}`,
    );
  }

  return runtime as WorkflowRuntime;
}

/**
 * Something this engine cannot work without.
 *
 * The loader already refuses a mount where an action has no port, so reaching
 * here means something registered an engine without the rest. Saying which
 * one beats a property access on undefined.
 */
function required<T>(ctx: TypedContext, kind: string): T {
  const port = ctx.port(kind);
  if (!port) {
    throw new Error(`the serial engine needs the \`${kind}\` port, and nothing mounted it`);
  }
  return port as T;
}

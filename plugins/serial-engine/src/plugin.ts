import {
  Budget,
  Engine,
  Notifier,
  Plugin,
  PluginContext,
  Queue,
  Store,
  WORKFLOW_RUNTIME,
  Workflow,
  WorkflowRuntime,
} from "@amy/core";
import { Worker } from "./Worker.js";
import { configSchema } from "./config.js";

export const plugin: Plugin = {
  name: "@amy/plugin-serial-engine",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    // Built on the first tick rather than now, because the workflow and the
    // ports it needs are registered by plugins that may be listed after this
    // one.
    let worker: Worker | null = null;
    const lazily = (): Worker => (worker ??= build(ctx));

    // `async` so a missing port becomes a rejected promise rather than a
    // synchronous throw out of something that returns one. A caller doing
    // `.catch()` should not have to also wrap the call in a try.
    const engine: Engine = {
      discover: async () => lazily().discover(),
      tick: async () => lazily().tick(),
    };

    registry.engine(engine);
  },
};

function build(ctx: PluginContext): Worker {
  const workflow = ctx.workflow() as Workflow | undefined;
  if (!workflow) {
    throw new Error("the serial engine needs a workflow, and no plugin registered one");
  }

  // The pair first: a workflow with no runtime is an engine that cannot
  // mean anything, and saying so beats reporting a missing queue to somebody
  // whose real problem is a half-mounted workflow.
  const runtime = runtimeFor(ctx, workflow);

  return new Worker({
    queue: required<Queue>(ctx, "queue"),
    records: required<Store>(ctx, "store"),
    workflow,
    runtime,
    notifier: required<Notifier>(ctx, "notifier"),
    now: ctx.now,
    log: ctx.log,
    // Optional: an install that set no ceiling mounts no budget, and this
    // engine then never asks one.
    budget: ctx.port("budget") as Budget | undefined,
    config: {
      staleClaimMs: ctx.config.staleClaimMs as number,
      retentionDays: ctx.config.retentionDays as number,
      maxItemAttempts: ctx.config.maxItemAttempts as number,
      retryDelayMs: ctx.config.retryDelayMs as number,
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
function runtimeFor(ctx: PluginContext, workflow: Workflow): WorkflowRuntime {
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
function required<T>(ctx: PluginContext, kind: string): T {
  const port = ctx.port(kind);
  if (!port) {
    throw new Error(`the serial engine needs the \`${kind}\` port, and nothing mounted it`);
  }
  return port as T;
}

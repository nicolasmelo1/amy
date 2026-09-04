import { Budget, Engine, Notifier, Plugin, PluginContext, Queue, Store } from "@amy/core";
import {
  Agent,
  CodeHost,
  Gate,
  Policy,
  Roster,
  TicketRecord,
  Tracker,
  DEFAULT_POLICY,
  ticketToQa,
} from "@amy/workflow-ticket-to-qa";
import { Worker } from "./Worker.js";
import { configSchema } from "./config.js";

/** Something one plugin contributes for another to read when it is needed. */
export interface Provider<T> {
  read(): T;
}

/** The collection the host puts workflow data in, such as today's roster. */
export const WORKFLOW_DATA = "workflow-data";

export const plugin: Plugin = {
  name: "@amy/plugin-serial-engine",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    // Built on the first tick rather than now, because the ports it needs are
    // mounted by plugins that may be listed after this one.
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
    registry.workflow(ticketToQa);
  },
};

function build(ctx: PluginContext): Worker {
  return new Worker({
    queue: required<Queue>(ctx, "queue"),
    records: required<Store<TicketRecord>>(ctx, "store"),
    tracker: required<Tracker>(ctx, "tracker"),
    host: required<CodeHost>(ctx, "code-host"),
    agent: required<Agent>(ctx, "agent"),
    gate: required<Gate>(ctx, "gate"),
    notifier: required<Notifier>(ctx, "notifier"),
    roster: () => provided<Roster>(ctx, "roster"),
    now: ctx.now,
    log: ctx.log,
    // Optional: an install that set no ceiling mounts no budget, and this
    // engine then never asks one.
    budget: ctx.port("budget") as Budget | undefined,
    config: {
      repos: ctx.config.repos as string[],
      qaStatusName: ctx.config.qaStatusName as string,
      policy: { ...DEFAULT_POLICY, ...(ctx.config.policy as Partial<Policy>) },
      staleClaimMs: ctx.config.staleClaimMs as number,
      retentionDays: ctx.config.retentionDays as number,
      maxItemAttempts: ctx.config.maxItemAttempts as number,
    },
  });
}

/**
 * A port this engine cannot work without.
 *
 * The loader already refuses a mount where an action has no port, so reaching
 * here means something registered an engine without the rest. Saying which
 * port beats a property access on undefined.
 */
function required<T>(ctx: PluginContext, kind: string): T {
  const port = ctx.port(kind);
  if (!port) {
    throw new Error(`the serial engine needs the \`${kind}\` port, and nothing mounted it`);
  }
  return port as T;
}

function provided<T>(ctx: PluginContext, name: string): T {
  const entry = ctx.contributions(WORKFLOW_DATA).get(name);
  if (!entry) {
    throw new Error(`the serial engine needs \`${name}\` in the \`${WORKFLOW_DATA}\` collection`);
  }
  return (entry as Provider<T>).read();
}

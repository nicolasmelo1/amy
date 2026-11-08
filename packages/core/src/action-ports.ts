import { HarnessReply } from "./ports/Harness.js";
import { Notifier } from "./ports/Notifier.js";
import { EventLog } from "./ports/EventLog.js";
import { ActionContext } from "./runtime.js";
import { Contract, ErrorEnvelope, MountedOperation, defineContract, invoke } from "./operation.js";
import { WorkRecord } from "./work.js";

/** What an action is handed beside its ports: a word to the operator that may be lost. */
export interface ActionDuties {
  /**
   * Says something to the operator about this work, and never lets that cost
   * a move. A channel that fails becomes a `notify.failed` line instead.
   *
   * For what is only worth saying. A message the work depends on — a write
   * handed to the operator, say — goes through `ports.notifier`, which still
   * fails the action, so the look is tried again rather than recorded as said.
   */
  announce(text: string): Promise<void>;
  /**
   * Calls a mounted plugin's operation by id, the way the command line does:
   * the input is validated against its schema before the handler, the output
   * after it.
   *
   * An output, or a stream's events in order, answers `ok`. A declared error,
   * an input the schema refused, or an id no plugin this profile mounted
   * offers answers the error, naming the id. Something the operation never
   * declared fails the action, the way any port that broke does.
   */
  operate(id: string, input: unknown): Promise<Operated>;
}

/** What an action is answered when it calls an operation. */
export type Operated =
  | { readonly ok: true; readonly output: unknown }
  | { readonly ok: false; readonly error: ErrorEnvelope };

/** A mounted operation by id, with the ports of the mount it was offered on. */
export type OperationLookup = (id: string) => (MountedOperation & { port(name: string): unknown }) | undefined;

/**
 * The ports one action receives, and the word it may say, bound to the work.
 *
 * The errand, note-to-plan and ticket-to-qa each carried the same two
 * closures: one wrote an `agent.run` line after every reply, so the budget
 * could add it up, and one swallowed a failed announcement into a
 * `notify.failed` line. A workflow that forgot the first spent money the
 * ceiling never saw. Both are the host's rules, so the host keeps them.
 *
 * Bound to the work rather than to the mount, because both lines name the
 * record and the state the action ran in, and a port shared by every action
 * cannot know which one is calling it.
 *
 * The ports stay as strict as they were. The engine's rule is that a call may
 * be swallowed only when its failure does not make the saved record a lie, so
 * only `announce` here is, and only because the action chose it.
 */
export function actionPorts<P extends object>(
  ports: P,
  work: ActionContext<WorkRecord, unknown>,
  log: EventLog | undefined,
  now: () => Date,
  operations: OperationLookup = () => undefined,
): { readonly ports: P } & ActionDuties {
  const append = (kind: "agent.run" | "notify.failed", detail: Record<string, unknown>): void => {
    try {
      log?.append({ at: now().toISOString(), kind, workId: work.record.id, state: work.record.state, detail });
    } catch {
      // The engine is what tells the operator its log is broken; two voices
      // for one outage is one too many.
    }
  };

  const attended: Record<string, unknown> = { ...(ports as Record<string, unknown>) };
  const { agent, notifier } = attended;

  // Every agent run is written against this work, whether the action asked
  // the agent itself or an operation it called did: a run the log never sees
  // is spending the budget's ceiling never counts.
  const billed = (port: unknown): unknown => (hasMethod(port, "ask")
    ? withMethod(port, "ask", (ask) => async (...args: unknown[]) => {
      const reply = (await ask(...args)) as HarnessReply;
      if (reply?.run) {
        const { run } = reply;
        append("agent.run", {
          harness: run.harness,
          model: run.model,
          outcome: run.outcome,
          durationMs: run.durationMs,
          costSource: run.costSource,
          ...(run.costUsd === undefined ? {} : { costUsd: run.costUsd }),
          ...(run.tokens === undefined ? {} : { tokens: { ...run.tokens } }),
        });
      }
      return reply;
    })
    : port);

  if (hasMethod(agent, "ask")) attended.agent = billed(agent);

  return {
    ports: attended as P,
    async announce(text) {
      try {
        if (!hasMethod(notifier, "announce")) throw new Error("no notifier is mounted, so nothing can reach you");
        await (notifier as Notifier).announce({ text, workId: work.record.id, state: work.record.state });
      } catch (error) {
        append("notify.failed", { error: error instanceof Error ? error.message : String(error), text });
      }
    },
    operate: (id, input) => operate(operations, id, input, billed),
  };
}

async function operate(operations: OperationLookup, id: string, input: unknown, billed: (port: unknown) => unknown): Promise<Operated> {
  const offered = operations(id);
  if (!offered) {
    return { ok: false, error: { code: "amy.unknown_operation", message: `no plugin this profile mounts offers the operation \`${id}\`` } };
  }
  const contract: Contract = defineContract([offered.operation]);
  const port = (name: string): unknown => (name === "agent" ? billed(offered.port(name)) : offered.port(name));
  const ran = await invoke(contract, id, input, { port, plugin: offered.scope });
  switch (ran.kind) {
    case "output":
      return { ok: true, output: ran.output };
    case "error":
    case "refused":
      return { ok: false, error: ran.error };
    case "internal":
      throw new Error(ran.error.message);
    case "stream": {
      const events: { event: string; data: unknown }[] = [];
      for await (const item of ran.events) {
        if (item.kind === "event") events.push({ event: item.event, data: item.data });
        else if (item.kind === "error") return { ok: false, error: item.error };
        else throw new Error(item.error.message);
      }
      return { ok: true, output: events };
    }
  }
}

type Method = (...args: unknown[]) => unknown;

function hasMethod<K extends string>(value: unknown, name: K): value is Record<K, Method> {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>)[name] === "function";
}

/**
 * The port with one method replaced and every other member as it was.
 *
 * A proxy rather than a spread: a port built as a class keeps its methods on
 * the prototype, and a spread would drop them while the mount still succeeded.
 * Every member is read with the port itself as the receiver, so an accessor
 * reading a `#private` field still finds it.
 */
function withMethod<T extends object>(port: T, name: string, wrap: (original: Method) => Method): T {
  const replaced = wrap((port as Record<string, Method>)[name]!.bind(port));
  return new Proxy(port, {
    get(target, key) {
      if (key === name) return replaced;
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

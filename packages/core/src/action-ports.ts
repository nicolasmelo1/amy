import { HarnessReply } from "./ports/Harness.js";
import { Notifier } from "./ports/Notifier.js";
import { EventLog } from "./ports/EventLog.js";
import { ActionContext } from "./runtime.js";
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
}

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

  if (hasMethod(agent, "ask")) {
    attended.agent = withMethod(agent, "ask", (ask) => async (...args: unknown[]) => {
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
    });
  }

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
  };
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

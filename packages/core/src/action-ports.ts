import { HarnessReply } from "./ports/Harness.js";
import { Announcement } from "./ports/Notifier.js";
import { EventLog } from "./ports/EventLog.js";
import { ActionContext } from "./runtime.js";
import { WorkRecord } from "./work.js";

/**
 * The ports one action receives, with the two duties every workflow used to
 * write around them by hand.
 *
 * The errand, note-to-plan and ticket-to-qa each carried the same two
 * closures: one wrote an `agent.run` line after every reply, so the budget
 * could add it up, and one swallowed a failed announcement into a
 * `notify.failed` line. A workflow that forgot the first spent money the
 * ceiling never saw; one that forgot the second lost a move to a channel
 * somebody misconfigured. Both are the host's rules, so the host keeps them.
 *
 * Bound to the work rather than to the mount, because both lines name the
 * record and the state the action ran in, and a port shared by every action
 * cannot know which one is calling it.
 *
 * Only the notifier is swallowed. The engine's rule is that a port call may
 * be swallowed only when its failure does not make the saved record a lie,
 * and the agent, the tracker and the code host still fail the tick.
 */
export function actionPorts<P extends object>(
  ports: P,
  work: ActionContext<WorkRecord, unknown>,
  log: EventLog | undefined,
  now: () => Date,
): P {
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

  if (hasMethod(notifier, "announce")) {
    attended.notifier = withMethod(notifier, "announce", (announce) => async (...args: unknown[]) => {
      try {
        await announce(...args);
      } catch (error) {
        append("notify.failed", {
          error: error instanceof Error ? error.message : String(error),
          text: (args[0] as Announcement | undefined)?.text,
        });
      }
    });
  }

  return attended as P;
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
 */
function withMethod<T extends object>(port: T, name: string, wrap: (original: Method) => Method): T {
  const replaced = wrap((port as Record<string, Method>)[name]!.bind(port));
  return new Proxy(port, {
    get(target, key, receiver) {
      if (key === name) return replaced;
      const value = Reflect.get(target, key, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

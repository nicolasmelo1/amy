import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { sayToOperator, unitOf } from "../src/index.js";
import type { OperatorChannels } from "../src/operator.js";

const FALSIFIER = "a_raw_work_id";
const planted = process.env.SF_FALSIFIER === FALSIFIER;

/** A record id at any call depth: `PROJ-1/WORK#1/CHECK#2` names `PROJ-1`. */
const recordId = fc
  .tuple(
    fc.stringMatching(/^[A-Z]{2,6}-[0-9]{1,4}$/),
    fc.array(fc.tuple(fc.constantFrom("WORK", "CHECK", "RUN"), fc.nat({ max: 8 })), { maxLength: 3 }),
  )
  .map(([root, calls]) => `${root}${calls.map(([state, n]) => `/${state}#${n + 1}`).join("")}`);

/** The mutation the property must reject: the thread is opened by the id given. */
async function rawSaid(channels: OperatorChannels, message: { text: string; workId: string; title: string; state: string }): Promise<string> {
  if (channels.conversation) {
    const thread = await channels.conversation.open(message.workId, message.title);
    await channels.conversation.post(thread, { text: message.text });
    return "thread";
  }
  await channels.notifier.announce({ text: message.text, workId: message.workId, state: message.state });
  return "notifier";
}

const say = planted ? rawSaid : sayToOperator;

function channelsFor(opened: string[], announced: string[]): OperatorChannels {
  return {
    conversation: {
      known: async () => undefined,
      open: async (workId: string) => {
        opened.push(workId);
        return { id: workId };
      },
      post: async () => "1",
      replies: async () => [],
    },
    notifier: {
      announce: async (announcement) => {
        announced.push(announcement.workId);
      },
    },
  };
}

describe("saying one thing to the operator", () => {
  it(FALSIFIER, async () => {
    await fc.assert(
      fc.asyncProperty(recordId, async (id) => {
        const opened: string[] = [];
        const announced: string[] = [];
        const threaded = await say(channelsFor(opened, announced), {
          text: "the work moved",
          workId: id,
          title: "one work",
          state: "queued",
        });
        expect(threaded).toBe("thread");
        expect(opened).toEqual([unitOf({ id })]);

        const heard: string[] = [];
        const notified = await say(
          { notifier: { announce: async (announcement) => { heard.push(announcement.workId); } } },
          { text: "the work moved", workId: id, title: "one work", state: "queued" },
        );
        expect(notified).toBe("notifier");
        expect(heard).toEqual([unitOf({ id })]);
      }),
      { numRuns: 50 },
    );
  });
});

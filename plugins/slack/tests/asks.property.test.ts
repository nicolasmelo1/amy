import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Ask, Reply } from "@amykit/core";
import { HttpRequest, HttpResponse, SlackApi, SlackConversation } from "../src/index.js";

const REPLAY_FALSIFIER = "a_replay_loses_the_answer";
const FIRST_FALSIFIER = "a_later_answer_replaces_the_first";
const planted = process.env.SF_FALSIFIER === REPLAY_FALSIFIER || process.env.SF_FALSIFIER === FIRST_FALSIFIER;

/**
 * The mutation both properties must reject: an adapter that forgets, on
 * every look, the answer it already accepted, and so decides from whatever
 * marks are on the ask now.
 */
class Forgetful extends SlackConversation {
  protected override rememberedAnswer(): undefined {
    return undefined;
  }
}

const CHANNEL = "C0WORK";
const OPERATOR = "U0ADA";
const BOT = "U0AMYBOT";
const THREAD = "1790000000.000100";
const ASK_TS = "1790000100.000100";
const SINCE = "2026-09-21T00:00:00.000Z";
const ASK: Ask = { id: "ship", prompt: "Ship it?", form: "approval", answers: ["approve", "reject"] };
const MARK = { approve: "white_check_mark", reject: "x" } as const;

/** What the operator's marks on the ask look like at one look. */
type Marks = "approve" | "reject" | "both" | "none";

/**
 * Slack, as far as `replies` reads it: the thread holds amy's ask with
 * whatever marks the operator left on it now, and every post is taken.
 */
class Workspace {
  marks: Marks = "none";
  private posted = 0;

  transport = async (request: HttpRequest): Promise<HttpResponse> => {
    const method = request.url.slice(request.url.lastIndexOf("/") + 1);
    const json = this.answer(method);
    return { status: 200, headers: {}, body: new TextEncoder().encode(JSON.stringify({ ok: true, ...json })) };
  };

  private answer(method: string): Record<string, unknown> {
    if (method === "auth.test") return { user_id: BOT };
    if (method === "conversations.replies") return { messages: [this.askMessage()], has_more: false };
    if (method === "reactions.get") return { message: this.askMessage() };
    if (method === "chat.postMessage") return { ts: `1790000200.${String(++this.posted).padStart(6, "0")}` };
    throw new Error(`the stand-in has no answer for ${method}`);
  }

  private askMessage() {
    const names = this.marks === "none" ? [] : this.marks === "both" ? [MARK.approve, MARK.reject] : [MARK[this.marks]];
    return {
      ts: ASK_TS,
      user: BOT,
      bot_id: "B0",
      metadata: { event_type: "amy_ask", event_payload: { ask: ASK } },
      reactions: names.map((name) => ({ name, users: [OPERATOR], count: 1 })),
    };
  }
}

function adapter(workspace: Workspace, directory: string): SlackConversation {
  const Kind = planted ? Forgetful : SlackConversation;
  return new Kind(new SlackApi("xoxb", { transport: workspace.transport }), { channel: CHANNEL, operator: OPERATOR, directory });
}

function answers(replies: readonly Reply[]): unknown[] {
  return replies.flatMap((reply) => (reply.answer ? [reply.answer] : []));
}

describe("Slack replays an accepted answer", () => {
  it("a_replay_loses_the_answer", async () => {
    await fc.assert(fc.asyncProperty(
      fc.constantFrom("approve", "reject") as fc.Arbitrary<"approve" | "reject">,
      fc.array(fc.record({
        marks: fc.constantFrom("approve", "reject", "both", "none") as fc.Arbitrary<Marks>,
        restart: fc.boolean(),
      }), { minLength: 1, maxLength: 4 }),
      async (first, later) => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-slack-replay-"));
        try {
          const workspace = new Workspace();
          workspace.marks = first;
          let amy = adapter(workspace, directory);
          const expected = [{ ask: ASK.id, chosen: [first] }];
          expect(answers(await amy.replies({ id: THREAD }, SINCE))).toEqual(expected);
          // Whatever the operator does to the marks afterwards, and however
          // often the process starts over, a look from the same since reads
          // the answer that was accepted, and only that one.
          for (const step of later) {
            workspace.marks = step.marks;
            if (step.restart) amy = adapter(workspace, directory);
            expect(answers(await amy.replies({ id: THREAD }, SINCE))).toEqual(expected);
          }
        } finally {
          fs.rmSync(directory, { recursive: true, force: true });
        }
      },
    ), { numRuns: 15 });
  });

  it("a_later_answer_replaces_the_first", async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(fc.constantFrom("approve", "reject") as fc.Arbitrary<"approve" | "reject">, { minLength: 2, maxLength: 5 }),
      async (sequence) => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-slack-first-"));
        try {
          const workspace = new Workspace();
          const amy = adapter(workspace, directory);
          // One complete answer at each look, the operator changing their
          // mind as often as they like: the first one taken is the answer.
          for (const marks of sequence) {
            workspace.marks = marks;
            expect(answers(await amy.replies({ id: THREAD }, SINCE))).toEqual([{ ask: ASK.id, chosen: [sequence[0]] }]);
          }
        } finally {
          fs.rmSync(directory, { recursive: true, force: true });
        }
      },
    ), { numRuns: 15 });
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Ask, Reply } from "@amykit/core";
import { BotApi, TelegramConversation } from "../src/index.js";
import { FiledAsk } from "../src/TelegramConversation.js";
import { BotApiStandIn, botApiStandIn, OPERATOR, TOKEN } from "./stand-in.js";

const FALSIFIER = "a_replay_loses_the_answer";
const planted = process.env.SF_FALSIFIER === FALSIFIER;

/** The mutation the property must reject: an adapter that reads its filed asks back without the answer it accepted. */
class Forgetful extends TelegramConversation {
  protected override askedUnder(topic: string): FiledAsk[] {
    return super.askedUnder(topic).map((asked) => ({ ...asked, accepted: undefined }));
  }
}

const ASKS: Ask[] = [
  { id: "ship", prompt: "Ship it?", form: "approval", answers: ["approve", "reject"] },
  { id: "currency", prompt: "Which currency?", form: "choice", answers: ["BRL", "USD", "EUR"] },
];

function adapter(telegram: BotApiStandIn, directory: string): TelegramConversation {
  const Kind = planted ? Forgetful : TelegramConversation;
  return new Kind(new BotApi(TOKEN, { transport: telegram.transport, sleep: async () => {} }), { operator: String(OPERATOR), directory });
}

/** The callback data of one button on the keyboard amy sent with the ask. */
function button(telegram: BotApiStandIn, index: number): string {
  const sent = telegram.calls.filter((call) => call.method === "sendMessage" && call.args.reply_markup !== undefined).at(-1)!;
  const keyboard = sent.args.reply_markup as { inline_keyboard: { callback_data: string }[][] };
  return keyboard.inline_keyboard.flat().find((one) => one.callback_data.endsWith(`:${index}`))!.callback_data;
}

function answers(replies: readonly Reply[]): unknown[] {
  return replies.flatMap((reply) => (reply.answer ? [reply.answer] : []));
}

describe("Telegram replays an accepted answer", () => {
  it("a_replay_loses_the_answer", async () => {
    await fc.assert(fc.asyncProperty(
      fc.constantFrom(...ASKS),
      fc.nat(),
      fc.array(fc.record({ press: fc.option(fc.nat(), { nil: undefined }), restart: fc.boolean() }), { minLength: 1, maxLength: 4 }),
      async (ask, pick, later) => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-replay-"));
        try {
          const telegram = botApiStandIn();
          let amy = adapter(telegram, directory);
          const thread = await amy.open("BILL-7", "Total");
          const since = new Date(Date.now() - 1000).toISOString();
          await amy.post(thread, { text: "", ask });
          const first = pick % ask.answers.length;
          const keys = ask.answers.map((_, index) => button(telegram, index));
          telegram.press(keys[first]!, { topic: Number(thread.id) });
          const expected = [{ ask: ask.id, chosen: [ask.answers[first]] }];
          expect(answers(await amy.replies(thread, since))).toEqual(expected);
          const asked = (telegram.calls.find((call) => call.method === "editMessageReplyMarkup")!.args.message_id) as number;
          // Whatever the operator presses afterwards, and however often the
          // process starts over, a look from the same since reads the answer
          // that was accepted, and only that one.
          for (const step of later) {
            if (step.press !== undefined) telegram.press(keys[step.press % keys.length]!, { topic: Number(thread.id), messageId: asked });
            if (step.restart) amy = adapter(telegram, directory);
            expect(answers(await amy.replies(thread, since))).toEqual(expected);
          }
        } finally {
          fs.rmSync(directory, { recursive: true, force: true });
        }
      },
    ), { numRuns: 10 });
  }, 60_000);
});

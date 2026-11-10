import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BotApi, TelegramConversation } from "../src/index.js";
import { BotApiStandIn, OPERATOR, SOMEBODY_ELSE, TOKEN, botApiStandIn } from "./stand-in.js";

function amyWith(telegram: BotApiStandIn, topics = true, directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-chat-"))) {
  const api = new BotApi(TOKEN, { transport: telegram.transport, sleep: async () => {} });
  return new TelegramConversation(api, { operator: String(OPERATOR), directory, topics });
}

const askedAt = (telegram: BotApiStandIn) => new Date(telegram.now() * 1000).toISOString();

describe("the private chat outside every topic is a chat (A1)", () => {
  it("files a message written outside every topic as an ask, and answers it there", async () => {
    const telegram = botApiStandIn();
    const amy = amyWith(telegram);

    telegram.say("how is the api project going?");
    const [message, ...rest] = await amy.chat();

    expect(rest).toEqual([]);
    expect(message).toMatchObject({ author: String(OPERATOR), text: "how is the api project going?", place: String(OPERATOR) });
    expect(message!.threaded).toBeUndefined();
    await amy.say(message!.place, "It has two pull requests open.");
    expect(telegram.inTheChat.map((one) => one.text)).toEqual(["It has two pull requests open."]);
  });

  it("hands a message out until it is settled, and never again after", async () => {
    const telegram = botApiStandIn();
    const amy = amyWith(telegram);
    telegram.say("first");
    telegram.say("second");

    const held = await amy.chat();
    expect(held.map((one) => one.text)).toEqual(["first", "second"]);
    expect((await amy.chat()).map((one) => one.text)).toEqual(["first", "second"]);

    await amy.settle(held[0]!.id);
    expect((await amy.chat()).map((one) => one.text)).toEqual(["second"]);
    expect(telegram.pending()).toBe(0);
  });

  it("hands out nothing filed for another operator of the same bot", async () => {
    const telegram = botApiStandIn();
    const shared = fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-shared-"));
    const api = new BotApi(TOKEN, { transport: telegram.transport, sleep: async () => {} });
    const theirs = new TelegramConversation(api, { operator: String(SOMEBODY_ELSE), directory: path.join(shared, "theirs"), shared });
    const mine = new TelegramConversation(api, { operator: String(OPERATOR), directory: path.join(shared, "mine"), shared });
    telegram.say("their question", { from: SOMEBODY_ELSE });

    expect((await theirs.chat()).map((one) => one.text)).toEqual(["their question"]);
    expect(await mine.chat()).toEqual([]);
  });

  it("refuses to settle an id it never filed", async () => {
    await expect(amyWith(botApiStandIn()).settle("slack:C1:1.2")).rejects.toThrow(/not a message this chat filed/);
  });

  it("keeps a work's topic replies the work's, and the chat's messages the chat's", async () => {
    const telegram = botApiStandIn();
    const amy = amyWith(telegram);
    const thread = await amy.open("TBO-1", "Totals");
    const since = askedAt(telegram);

    telegram.say("/decide BRL", { topic: Number(thread.id) });
    telegram.say("and what else is open?");

    expect((await amy.chat()).map((one) => one.text)).toEqual(["and what else is open?"]);
    expect(await amy.replies(thread, since)).toMatchObject([{ text: "BRL", kind: "decision" }]);
  });

  it("reaches a work from the chat by its id, even with topics", async () => {
    const telegram = botApiStandIn();
    const amy = amyWith(telegram);
    const thread = await amy.open("TBO-1", "Totals");
    const since = askedAt(telegram);

    telegram.say("TBO-1: /decide ship it");

    expect(await amy.chat()).toEqual([]);
    expect(await amy.replies(thread, since)).toMatchObject([{ text: "ship it", kind: "decision" }]);
  });
});

describe("a message from anybody else answers nothing (A9)", () => {
  it("files nothing another person writes to the bot", async () => {
    const telegram = botApiStandIn();
    const amy = amyWith(telegram);

    telegram.say("restart amy", { from: SOMEBODY_ELSE });

    expect(await amy.chat()).toEqual([]);
    expect(telegram.pending()).toBe(0);
  });
});

describe("progress is edited in place", () => {
  it("declares edit, and edits what it said", async () => {
    const telegram = botApiStandIn();
    const amy = amyWith(telegram);
    expect(amy.edit).toBe(true);

    const id = await amy.say(String(OPERATOR), "Thinking with claude…");
    await amy.revise(String(OPERATOR), id, "Thinking with claude…\nRunning amy status…");
    // The same text again is not an error: there is nothing to redraw.
    await amy.revise(String(OPERATOR), id, "Thinking with claude…\nRunning amy status…");

    expect(telegram.inTheChat).toEqual([{ id: Number(id), text: "Thinking with claude…\nRunning amy status…" }]);
  });

  it("says a long answer in parts", async () => {
    const telegram = botApiStandIn();
    const amy = amyWith(telegram);

    await amy.say(String(OPERATOR), `${"a".repeat(4096)}\n${"b".repeat(10)}`);

    expect(telegram.inTheChat.map((one) => one.text)).toEqual(["a".repeat(4096), "b".repeat(10)]);
  });
});

describe("a chat without topics is addressed, not guessed (A6)", () => {
  it("declares no threads, and opens a work without asking Telegram for a topic", async () => {
    const telegram = botApiStandIn({ topicsEnabled: false });
    const amy = amyWith(telegram, false);

    expect(amy.threads).toBeUndefined();
    const thread = await amy.open("TBO-1", "Totals");

    expect(thread.id).toMatch(/^w[0-9a-f]{16}$/);
    expect(telegram.calls.filter((call) => call.method === "createForumTopic")).toEqual([]);
    expect(await amy.open("TBO-1", "Totals")).toEqual(thread);
  });

  it("routes a quote of amy's message for TBO-1 to TBO-1, TBO-2: to TBO-2, and anything else to the chat", async () => {
    const telegram = botApiStandIn({ topicsEnabled: false });
    const amy = amyWith(telegram, false);
    const one = await amy.open("TBO-1", "Totals");
    const two = await amy.open("TBO-2", "Taxes");
    const since = askedAt(telegram);
    const asked = Number(await amy.post(one, { text: "Which currency?" }));
    await amy.post(two, { text: "Which tax?" });

    telegram.say("BRL", { quotes: asked });
    telegram.say("TBO-2: the federal one");
    telegram.say("what else is open?");

    expect(telegram.inTheChat.map((said) => said.text)).toEqual(["TBO-1: Which currency?", "TBO-2: Which tax?"]);
    expect((await amy.replies(one, since)).map((reply) => reply.text)).toEqual(["BRL"]);
    expect((await amy.replies(two, since)).map((reply) => reply.text)).toEqual(["the federal one"]);
    expect((await amy.chat()).map((message) => message.text)).toEqual(["what else is open?"]);
  });

  it("files a quote of a message amy filed under no work as the chat's, marked unaddressed", async () => {
    const telegram = botApiStandIn({ topicsEnabled: false });
    const amy = amyWith(telegram, false);
    const own = telegram.say("a note to myself");

    telegram.say("and this?", { quotes: own.message_id });

    expect((await amy.chat()).map(({ text, unaddressed }) => ({ text, unaddressed }))).toEqual([
      { text: "a note to myself", unaddressed: undefined },
      { text: "and this?", unaddressed: true },
    ]);
  });

  it("continues the conversation when the quote is of what amy said in the chat", async () => {
    const telegram = botApiStandIn({ topicsEnabled: false });
    const amy = amyWith(telegram, false);
    const answer = await amy.say(String(OPERATOR), "Two pull requests are open.");

    telegram.say("which ones?", { quotes: Number(answer) });

    expect(await amy.chat()).toMatchObject([{ text: "which ones?" }]);
    expect((await amy.chat())[0]!.unaddressed).toBeUndefined();
  });

  it("takes a press on a work's question in the chat, through what amy filed", async () => {
    const telegram = botApiStandIn({ topicsEnabled: false });
    const amy = amyWith(telegram, false);
    const thread = await amy.open("TBO-1", "Totals");
    const since = askedAt(telegram);
    const posted = Number(await amy.post(thread, { text: "Ship?", ask: { id: "ship", prompt: "Ship?", form: "approval", answers: ["approve", "reject"] } }));

    const keyboard = telegram.calls.find((call) => call.method === "sendMessage" && call.args.reply_markup)!.args.reply_markup as { inline_keyboard: { callback_data: string }[][] };
    telegram.press(keyboard.inline_keyboard[0]![0]!.callback_data, { topic: 0, messageId: posted });

    expect(await amy.replies(thread, since)).toMatchObject([{ kind: "decision", answer: { ask: "ship", chosen: ["approve"] } }]);
  });

  it("is ready in the doctor with topic mode off", async () => {
    const telegram = botApiStandIn({ topicsEnabled: false });

    expect((await amyWith(telegram, false).checks())[0]).toMatchObject({ ok: true, detail: expect.stringMatching(/addressed by a quote or its id/) });
    expect((await amyWith(telegram, true).checks())[0]).toMatchObject({ ok: false, detail: expect.stringMatching(/or set topics: false/) });
  });
});

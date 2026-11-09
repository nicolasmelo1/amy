import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BotApi, TelegramConversation } from "../src/index.js";
import { botApiStandIn, OPERATOR, SOMEBODY_ELSE, TOKEN } from "./stand-in.js";

function conversation(telegram: ReturnType<typeof botApiStandIn>, directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-asks-"))) {
  return { amy: new TelegramConversation(new BotApi(TOKEN, { transport: telegram.transport, sleep: async () => {} }), { operator: String(OPERATOR), directory }), directory };
}

function callback(telegram: ReturnType<typeof botApiStandIn>, index: number | "send"): string {
  const sent = telegram.calls.filter((call) => call.method === "sendMessage").at(-1)!;
  const keyboard = sent.args.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
  return keyboard.inline_keyboard.flat().find((button) => index === "send" ? button.text === "Send" : button.callback_data.endsWith(`:${index}`))!.callback_data;
}

describe("Telegram structured asks", () => {
  it("advertises asks and answers an approval through its inline buttons", async () => {
    const telegram = botApiStandIn();
    const { amy } = conversation(telegram);
    expect(amy.asks).toBe(true);
    const thread = await amy.open("BILL-7", "Total");
    const since = new Date().toISOString();
    await amy.post(thread, { text: "Decision needed", ask: { id: "ship", prompt: "Ship it?", form: "approval", answers: ["approve", "reject"] } });

    telegram.press(callback(telegram, 0), { topic: Number(thread.id) });
    const replies = await amy.replies(thread, since);

    expect(replies).toMatchObject([{ kind: "decision", answer: { ask: "ship", chosen: ["approve"] } }]);
    expect(telegram.calls.filter((call) => call.method === "answerCallbackQuery")).toHaveLength(1);
  });

  it("answers one choice and only answers choices after Send, updating the checked markup", async () => {
    const telegram = botApiStandIn();
    const { amy } = conversation(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = new Date().toISOString();
    await amy.post(thread, { text: "", ask: { id: "currency", prompt: "One", form: "choice", answers: ["BRL", "USD"] } });
    telegram.press(callback(telegram, 1), { topic: Number(thread.id) });
    expect((await amy.replies(thread, since))[0]!.answer).toEqual({ ask: "currency", chosen: ["USD"] });

    await amy.post(thread, { text: "", ask: { id: "colours", prompt: "Many", form: "choices", answers: ["red", "blue"] } });
    telegram.press(callback(telegram, 0), { topic: Number(thread.id) });
    expect(await amy.replies(thread, since)).toHaveLength(1);
    const edit = telegram.calls.filter((call) => call.method === "editMessageReplyMarkup").at(-1)!;
    expect(JSON.stringify(edit.args.reply_markup)).toContain("✓ red");
    telegram.press(callback(telegram, 1), { topic: Number(thread.id) });
    telegram.press(callback(telegram, "send"), { topic: Number(thread.id) });

    expect((await amy.replies(thread, since)).map((reply) => reply.answer)).toEqual([{ ask: "currency", chosen: ["USD"] }, { ask: "colours", chosen: ["red", "blue"] }]);
  });

  it("sends an ask it cannot put on a keyboard as a plain numbered question: too few, repeated, empty or over-long answers", async () => {
    const telegram = botApiStandIn();
    const { amy } = conversation(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const malformed = [["BRL"], ["BRL", "BRL"], ["BRL", ""], ["BRL", "x".repeat(65)]];
    for (const [index, answers] of malformed.entries()) {
      await amy.post(thread, { text: "", ask: { id: `bad-${index}`, prompt: "Which currency?", form: "choice", answers } });
    }
    const sent = telegram.calls.filter((call) => call.method === "sendMessage" && String(call.args.text).includes("Which currency?"));
    expect(sent).toHaveLength(malformed.length);
    for (const call of sent) expect(call.args.reply_markup).toBeUndefined();
    expect(String(sent[3]!.args.text)).toContain("1. BRL");
  });

  it("draws a choices keyboard again from what was saved when the first redraw failed", async () => {
    const telegram = botApiStandIn();
    let failNextEdit = true;
    const transport: typeof telegram.transport = async (request) => {
      if (failNextEdit && request.url.endsWith("/editMessageReplyMarkup")) {
        failNextEdit = false;
        return { status: 400, body: new TextEncoder().encode(JSON.stringify({ ok: false, error_code: 400, description: "Bad Request: try again" })) };
      }
      return telegram.transport(request);
    };
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-asks-"));
    const amy = new TelegramConversation(new BotApi(TOKEN, { transport, sleep: async () => {} }), { operator: String(OPERATOR), directory });
    const thread = await amy.open("BILL-7", "Total");
    const since = new Date().toISOString();
    await amy.post(thread, { text: "", ask: { id: "colors", prompt: "Pick", form: "choices", answers: ["red", "blue"] } });
    telegram.press(callback(telegram, 1), { topic: Number(thread.id) });

    await expect(amy.replies(thread, since)).rejects.toThrow(/try again/);
    await expect(amy.replies(thread, since)).resolves.toEqual([]);

    const edits = telegram.calls.filter((call) => call.method === "editMessageReplyMarkup");
    const drawn = edits.at(-1)!.args.reply_markup as { inline_keyboard: { text: string }[][] };
    expect(drawn.inline_keyboard.flat().map((button) => button.text)).toContain("✓ blue");
    // Redelivered, the press was not taken twice: blue is still the one checked.
    expect(drawn.inline_keyboard.flat().map((button) => button.text)).toContain("red");
  });

  it("sends one keyboard when the same ask is posted twice at once, and both posts name it", async () => {
    const telegram = botApiStandIn();
    const { amy } = conversation(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const ask = { id: "ship", prompt: "Ship it?", form: "approval" as const, answers: ["approve", "reject"] as ["approve", "reject"] };

    const [first, second] = await Promise.all([amy.post(thread, { text: "", ask }), amy.post(thread, { text: "", ask })]);

    expect(first).toBe(second);
    expect(telegram.calls.filter((call) => call.method === "sendMessage" && call.args.reply_markup !== undefined)).toHaveLength(1);
  });

  it("confirms an expired callback after saving its answer", async () => {
    const telegram = botApiStandIn();
    const api = new BotApi(TOKEN, {
      transport: async (request) => request.url.endsWith("/answerCallbackQuery")
        ? { status: 400, body: new TextEncoder().encode(JSON.stringify({ ok: false, error_code: 400, description: "Bad Request: query is too old" })) }
        : telegram.transport(request),
      sleep: async () => {},
    });
    const amy = new TelegramConversation(api, { operator: String(OPERATOR), directory: fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-asks-")) });
    const thread = await amy.open("BILL-7", "Total");
    const since = new Date().toISOString();
    await amy.post(thread, { text: "", ask: { id: "ship", prompt: "Ship?", form: "approval", answers: ["approve", "reject"] } });
    telegram.press(callback(telegram, 0), { topic: Number(thread.id) });

    await expect(amy.replies(thread, since)).resolves.toMatchObject([{ answer: { ask: "ship", chosen: ["approve"] } }]);
    expect(telegram.pending()).toBe(0);
  });

  it("ignores a non-operator press, acknowledges stale asks, and replays an accepted durable answer after restart", async () => {
    const telegram = botApiStandIn();
    const { amy, directory } = conversation(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = new Date().toISOString();
    await amy.post(thread, { text: "", ask: { id: "ship", prompt: "Ship?", form: "approval", answers: ["approve", "reject"] } });
    const approve = callback(telegram, 0);
    telegram.press(approve, { topic: Number(thread.id), from: SOMEBODY_ELSE });
    expect(await amy.replies(thread, since)).toEqual([]);
    expect(telegram.calls.filter((call) => call.method === "answerCallbackQuery")).toHaveLength(1);

    telegram.press(approve, { topic: Number(thread.id) });
    expect((await amy.replies(thread, since))[0]!.answer).toEqual({ ask: "ship", chosen: ["approve"] });
    telegram.press(approve, { topic: Number(thread.id) });
    await amy.replies(thread, since);
    expect(telegram.calls.filter((call) => call.method === "answerCallbackQuery").at(-1)!.args.text).toBe("this question is no longer open");
    telegram.press("amy:000000000000000000000000:0", { topic: Number(thread.id) });
    await amy.replies(thread, since);
    expect(telegram.calls.filter((call) => call.method === "answerCallbackQuery").at(-1)!.args.text).toBe("this question is no longer open");

    const restarted = conversation(telegram, directory).amy;
    expect((await restarted.replies(thread, since))[0]!.answer).toEqual({ ask: "ship", chosen: ["approve"] });
  });
});

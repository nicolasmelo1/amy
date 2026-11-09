import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Ask } from "@amykit/core";
import { HttpRequest, HttpResponse, SlackApi, SlackConversation } from "../src/index.js";

const CHANNEL = "C0WORK";
const OPERATOR = "U0ADA";
const BOT = "U0AMYBOT";
const THREAD = "1790000000.000100";
const ASK = { id: "ship", prompt: "Ship it?", form: "approval" as const, answers: ["approve", "reject"] as ["approve", "reject"] };

type Script = { method: string; body?: Record<string, unknown>; json: Record<string, unknown> };
class Http {
  readonly calls: HttpRequest[] = [];
  constructor(private readonly script: Script[]) {}
  transport = async (request: HttpRequest): Promise<HttpResponse> => {
    this.calls.push(request);
    const entry = this.script.shift();
    if (!entry || !request.url.endsWith(`/api/${entry.method}`)) throw new Error(`unexpected ${request.url}`);
    if (entry.body) expect(Object.fromEntries(new URLSearchParams(request.body))).toMatchObject(entry.body);
    return { status: 200, headers: {}, body: new TextEncoder().encode(JSON.stringify({ ok: true, ...entry.json })) };
  };
  args(method: string): Record<string, string>[] {
    return this.calls.filter((call) => call.url.endsWith(`/api/${method}`)).map((call) => Object.fromEntries(new URLSearchParams(call.body)));
  }
}

let directory: string;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-slack-asks-")); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });
function slack(http: Http): SlackConversation { return new SlackConversation(new SlackApi("xoxb", { transport: http.transport }), { channel: CHANNEL, operator: OPERATOR, directory }); }
function auth(): Script { return { method: "auth.test", json: { user_id: BOT } }; }
function messages(messages: unknown[]): Script { return { method: "conversations.replies", json: { messages, has_more: false } }; }
function askMessage(ts: string, ask: Ask = ASK, reactions: unknown[] = []) { return { ts, user: BOT, bot_id: "B0", metadata: { event_type: "amy_ask", event_payload: { ask } }, reactions }; }
function reaction(name: string, users: string[], count = users.length) { return { name, users, count }; }

describe("Slack structured asks", () => {
  it("advertises asks and posts an approval with its exact control reactions", async () => {
    const http = new Http([
      { method: "chat.postMessage", body: { channel: CHANNEL, thread_ts: THREAD }, json: { ts: "1790000001.000100" } },
      { method: "reactions.add", body: { channel: CHANNEL, timestamp: "1790000001.000100", name: "white_check_mark" }, json: {} },
      { method: "reactions.add", body: { channel: CHANNEL, timestamp: "1790000001.000100", name: "x" }, json: {} },
    ]);
    const conversation = slack(http);
    expect(conversation.asks).toBe(true);
    await conversation.post({ id: THREAD }, { text: "Decision needed", ask: ASK });
    expect(http.args("chat.postMessage")[0]).toEqual({ channel: CHANNEL, thread_ts: THREAD, text: "Decision needed\nShip it?\n✅ approve\n❌ reject", metadata: JSON.stringify({ event_type: "amy_ask", event_payload: { ask: ASK } }) });
  });

  it("uses keycaps and submit for multi-choice, but falls back over ten or on a reaction refusal", async () => {
    const choices = { id: "colors", prompt: "Pick", form: "choices" as const, answers: ["red", "blue"] };
    const over = { id: "many", prompt: "Many", form: "choice" as const, answers: Array.from({ length: 11 }, (_, i) => String(i)) };
    const http = new Http([
      { method: "chat.postMessage", json: { ts: "1.1" } },
      { method: "reactions.add", body: { name: "one" }, json: {} }, { method: "reactions.add", body: { name: "two" }, json: {} }, { method: "reactions.add", body: { name: "white_check_mark" }, json: {} },
      { method: "chat.postMessage", json: { ts: "1.2" } },
      { method: "chat.postMessage", json: { ts: "1.3" } },
      { method: "reactions.add", body: { name: "white_check_mark" }, json: { ok: false, error: "no_reaction" } },
      { method: "chat.postMessage", json: { ts: "1.4" } },
    ]);
    await slack(http).post({ id: THREAD }, { text: "", ask: choices });
    await slack(http).post({ id: THREAD }, { text: "", ask: over });
    await slack(http).post({ id: THREAD }, { text: "", ask: ASK });
    const posts = http.args("chat.postMessage");
    expect(posts[1]!.text).toMatch(/1\. 0[\s\S]*11\. 10/);
    expect(posts[1]!.metadata).toContain("amy_ask_fallback");
    expect(posts[3]!.text).toContain("1. approve\n2. reject");
    expect(http.args("reactions.add").map((call) => call.name)).toEqual(["one", "two", "white_check_mark", "white_check_mark"]);
  });

  it("accepts only the configured operator and expands partial reaction user lists", async () => {
    const http = new Http([
      auth(), messages([askMessage("1790000100.000100", ASK, [reaction("white_check_mark", ["U0OUT"], 2)])]),
      messages([askMessage("1790000100.000100", ASK, [reaction("white_check_mark", ["U0OUT"], 2)])]),
      { method: "reactions.get", body: { channel: CHANNEL, timestamp: "1790000100.000100", full: "true" }, json: { message: { reactions: [reaction("white_check_mark", [OPERATOR, "U0OUT"])] } } },
    ]);
    const replies = await slack(http).replies({ id: THREAD }, "2026-09-21T00:00:00.000Z");
    expect(replies).toMatchObject([{ author: OPERATOR, kind: "decision", answer: { ask: "ship", chosen: ["approve"] } }]);
    expect(http.args("conversations.replies").every((request) => request.include_all_metadata === "true")).toBe(true);
  });

  it("returns selected choices only after the operator submits them and ignores outsider marks", async () => {
    const ask = { id: "colors", prompt: "Pick", form: "choices" as const, answers: ["red", "blue"] };
    const noSubmit = askMessage("1790000100.000100", ask, [reaction("one", [OPERATOR])]);
    const submitted = askMessage("1790000101.000100", ask, [reaction("one", [OPERATOR]), reaction("two", [OPERATOR]), reaction("white_check_mark", ["U0OUT"])]);
    const complete = askMessage("1790000102.000100", ask, [reaction("one", [OPERATOR]), reaction("two", [OPERATOR]), reaction("white_check_mark", [OPERATOR])]);
    const http = new Http([auth(), messages([noSubmit, submitted, complete]), messages([noSubmit, submitted, complete])]);
    const replies = await slack(http).replies({ id: THREAD }, "2026-09-21T00:00:00.000Z");
    expect(replies).toHaveLength(1);
    expect(replies[0]!.answer).toEqual({ ask: "colors", chosen: ["red", "blue"] });
  });

  it("reports one ambiguous single choice and waits for choices until submit", async () => {
    const single = { id: "one", prompt: "Pick one", form: "choice" as const, answers: ["red", "blue"] };
    const multi = { id: "many", prompt: "Pick", form: "choices" as const, answers: ["red", "blue"] };
    const http = new Http([
      auth(), messages([askMessage("1790000100.000100", single, [reaction("one", [OPERATOR]), reaction("two", [OPERATOR])]), askMessage("1790000101.000100", multi, [reaction("one", [OPERATOR]), reaction("two", [OPERATOR])])]),
      messages([askMessage("1790000100.000100", single, [reaction("one", [OPERATOR]), reaction("two", [OPERATOR])]), askMessage("1790000101.000100", multi, [reaction("one", [OPERATOR]), reaction("two", [OPERATOR])])]),
      { method: "chat.postMessage", json: { ts: "1790000102.000100" } },
    ]);
    expect(await slack(http).replies({ id: THREAD }, "2026-09-21T00:00:00.000Z")).toEqual([]);
    const posted = http.args("chat.postMessage");
    expect(posted).toHaveLength(1);
    expect(posted[0]!.text).toContain("conflicting answers for one: one, two");
  });

  it("ignores an unrelated incomplete submit reaction on a single choice", async () => {
    const ask = { id: "currency", prompt: "Pick", form: "choice" as const, answers: ["BRL", "USD"] };
    const http = new Http([
      auth(),
      messages([askMessage("1790000100.000100", ask, [reaction("two", [OPERATOR]), reaction("white_check_mark", ["U0OUT"], 2)])]),
      messages([askMessage("1790000100.000100", ask, [reaction("two", [OPERATOR]), reaction("white_check_mark", ["U0OUT"], 2)])]),
    ]);

    await expect(slack(http).replies({ id: THREAD }, "2026-09-21T00:00:00.000Z")).resolves.toMatchObject([
      { answer: { ask: "currency", chosen: ["USD"] } },
    ]);
    expect(http.args("reactions.get")).toEqual([]);
  });

  it("replays the first answer after a changed or conflicting reaction, once acknowledging it", async () => {
    const approved = askMessage("1790000100.000100", ASK, [reaction("white_check_mark", [OPERATOR])]);
    const rejected = askMessage("1790000100.000100", ASK, [reaction("x", [OPERATOR])]);
    const conflicted = askMessage("1790000100.000100", ASK, [reaction("white_check_mark", [OPERATOR]), reaction("x", [OPERATOR])]);
    const firstLook = await slack(new Http([auth(), messages([approved]), messages([approved])])).replies({ id: THREAD }, "2026-09-21T00:00:00.000Z");
    const restarted = new Http([auth(), messages([rejected, conflicted]), messages([rejected, conflicted]),
      { method: "chat.postMessage", json: { ts: "1790000102.000100" } },
      { method: "chat.postMessage", json: { ts: "1790000103.000100" } },
    ]);
    const secondLook = await slack(restarted).replies({ id: THREAD }, "2026-09-21T00:00:00.000Z");
    expect(firstLook[0]!.answer).toEqual({ ask: "ship", chosen: ["approve"] });
    expect(secondLook).toMatchObject([{ answer: { ask: "ship", chosen: ["approve"] } }]);
    expect(secondLook).toHaveLength(1);
    expect(restarted.args("chat.postMessage").map((post) => post.text)).toEqual(expect.arrayContaining([
      expect.stringContaining("already took ship: approve"),
      expect.stringContaining("conflicting answers for ship"),
    ]));
    expect(restarted.args("chat.postMessage").filter((post) => post.text?.includes("already took ship") === true)).toHaveLength(1);
  });

  it("records a notice during the poll so duplicate asks cannot post it twice", async () => {
    const duplicate = askMessage("1790000101.000100", ASK, [reaction("white_check_mark", [OPERATOR]), reaction("x", [OPERATOR])]);
    const http = new Http([auth(), messages([duplicate, duplicate]), messages([duplicate, duplicate]), { method: "chat.postMessage", json: { ts: "1790000102.000100" } }]);
    await expect(slack(http).replies({ id: THREAD }, "2026-09-21T00:00:00.000Z")).resolves.toEqual([]);
    expect(http.args("chat.postMessage")).toHaveLength(1);
  });
});

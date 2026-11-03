import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BotApi, TelegramConversation } from "../src/index.js";
import { BotApiStandIn, OPERATOR, SOMEBODY_ELSE, TOKEN, botApiStandIn } from "./stand-in.js";

function amyWith(telegram: BotApiStandIn, directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-")), maxFileBytes?: number) {
  const api = new BotApi(TOKEN, { transport: telegram.transport, sleep: async () => {} });
  return { amy: new TelegramConversation(api, { operator: String(OPERATOR), directory, ...(maxFileBytes ? { maxFileBytes } : {}) }), directory };
}

/** An instant just before Telegram's clock now, the way a question's time is kept. */
const askedAt = (telegram: BotApiStandIn) => new Date(telegram.now() * 1000).toISOString();

describe("a topic per piece of work", () => {
  it("opens one topic in the operator's private chat, and the same one again", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);

    const first = await amy.open("BILL-7", "Show the currency on the invoice total");
    const again = await amy.open("BILL-7", "Show the currency on the invoice total");

    expect(again).toEqual(first);
    expect([...telegram.topics.values()]).toEqual(["Show the currency on the invoice total"]);
    expect(telegram.calls.filter((call) => call.method === "createForumTopic")).toEqual([
      { method: "createForumTopic", args: { chat_id: OPERATOR, name: "Show the currency on the invoice total" } },
    ]);
  });

  it("reopens the topic after a restart instead of opening a second", async () => {
    const telegram = botApiStandIn();
    const { amy, directory } = amyWith(telegram);
    const before = await amy.open("BILL-7", "The invoice total");

    const after = await amyWith(telegram, directory).amy.open("BILL-7", "The invoice total");

    expect(after).toEqual(before);
    expect(telegram.topics.size).toBe(1);
  });

  it("opens one topic for two looks at the same work at once", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);

    const [a, b] = await Promise.all([amy.open("BILL-7", "Total"), amy.open("BILL-7", "Total")]);

    expect(a).toEqual(b);
    expect(telegram.topics.size).toBe(1);
  });

  it("names a topic with as much of the title as Telegram holds", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);

    await amy.open("BILL-7", "x".repeat(300));

    const [name] = [...telegram.topics.values()];
    expect(name).toHaveLength(128);
    expect(name!.endsWith("…")).toBe(true);
  });
});

describe("posting", () => {
  it("posts into the work's topic and answers the message id", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");

    const id = await amy.post(thread, { text: "- Which currency?" });

    expect(telegram.sent).toEqual([{ topic: Number(thread.id), text: "- Which currency?" }]);
    expect(id).toMatch(/^\d+$/);
  });

  it("sends what Telegram would refuse as one message in parts", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");

    await amy.post(thread, { text: `${"a".repeat(4000)}\n${"b".repeat(4000)}` });

    expect(telegram.sent.map((message) => message.text.length)).toEqual([4000, 4000]);
  });

  it("refuses to upload a file", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");

    await expect(amy.post(thread, { text: "see", files: ["/tmp/x.png"] })).rejects.toThrow(/does not upload files/);
  });
});

describe("replies", () => {
  it("reads the operator's reply in the work's topic, once", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    telegram.say("BRL, beside the total", { topic: Number(thread.id) });

    const replies = await amy.replies(thread, since);

    expect(replies).toEqual([{ at: expect.any(String), author: String(OPERATOR), text: "BRL, beside the total", files: [] }]);
    expect(await amy.replies(thread, replies[0]!.at)).toEqual([]);
    expect(telegram.pending()).toBe(0);
  });

  it("reads nothing from anybody else, or from outside the topic", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    telegram.say("USD", { topic: Number(thread.id), from: SOMEBODY_ELSE });
    telegram.say("BRL, said outside every topic");

    expect(await amy.replies(thread, since)).toEqual([]);
  });

  it("files a reply under its own work, never another's", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);
    const invoice = await amy.open("BILL-7", "Invoice");
    const credit = await amy.open("BILL-8", "Credit note");
    const since = askedAt(telegram);
    telegram.say("for the credit note: EUR", { topic: Number(credit.id) });

    expect(await amy.replies(invoice, since)).toEqual([]);
    expect((await amy.replies(credit, since)).map((reply) => reply.text)).toEqual(["for the credit note: EUR"]);
  });

  it("keeps two replies in one second in order, both after a question asked in it", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const first = telegram.say("BRL", { topic: Number(thread.id) });
    const second = telegram.say("and no rounding", { topic: Number(thread.id) });
    second.date = first.date;
    // Asked later in the same second Telegram stamped both replies with.
    const since = new Date(Number(first.date) * 1000 + 500).toISOString();

    const replies = await amy.replies(thread, since);

    expect(replies.map((reply) => reply.text)).toEqual(["BRL", "and no rounding"]);
    expect(replies[0]!.at < replies[1]!.at).toBe(true);
  });

  it("loses no answer across a restart between the question and the answer", async () => {
    const telegram = botApiStandIn();
    const { amy, directory } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    await amy.post(thread, { text: "- Which currency?" });
    const since = askedAt(telegram);
    telegram.say("BRL", { topic: Number(thread.id) });

    const restarted = amyWith(telegram, directory).amy;
    const reopened = await restarted.open("BILL-7", "Total");

    expect((await restarted.replies(reopened, since)).map((reply) => reply.text)).toEqual(["BRL"]);
  });

  it("finds an answer another process read off Telegram first", async () => {
    const telegram = botApiStandIn();
    const { amy: one, directory } = amyWith(telegram);
    const other = amyWith(telegram, directory).amy;
    const invoice = await one.open("BILL-7", "Invoice");
    const credit = await one.open("BILL-8", "Credit note");
    const since = askedAt(telegram);
    telegram.say("EUR", { topic: Number(credit.id) });

    // The first process reads its own topic, and so confirms every update.
    expect(await one.replies(invoice, since)).toEqual([]);

    expect((await other.replies(credit, since)).map((reply) => reply.text)).toEqual(["EUR"]);
  });

  it("refuses an instant that is not one", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);

    await expect(amy.replies({ id: "11" }, "yesterday")).rejects.toThrow(/not an instant/);
  });
});

describe("files in a reply", () => {
  it("arrives as a readable local path", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    telegram.say("like this", { topic: Number(thread.id), file: { name: "total.png", bytes: new Uint8Array([1, 2, 3]) } });

    const [reply] = await amy.replies(thread, since);

    expect(reply!.text).toBe("like this");
    expect(reply!.files).toHaveLength(1);
    expect([...fs.readFileSync(reply!.files[0]!)]).toEqual([1, 2, 3]);
  });

  it("takes a photo at its largest size", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    telegram.say("a screenshot", { topic: Number(thread.id), photo: true, file: { name: "photo", bytes: new Uint8Array([9]) } });

    const [reply] = await amy.replies(thread, since);

    expect(fs.existsSync(reply!.files[0]!)).toBe(true);
  });

  it("names one past the size limit instead of fetching it", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram, undefined, 2);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    telegram.say("the recording", { topic: Number(thread.id), file: { name: "call.mp4", bytes: new Uint8Array([1, 2, 3]) } });

    const [reply] = await amy.replies(thread, since);

    expect(reply!.files).toEqual([]);
    expect(reply!.text).toBe("the recording\n[call.mp4 was not downloaded: it is larger than 2 bytes]");
    expect(telegram.calls.some((call) => call.method === "getFile")).toBe(false);
  });

  it("names one Telegram turns out to hold larger than it said", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram, undefined, 2);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    telegram.say("small, it said", { topic: Number(thread.id), file: { name: "big.bin", bytes: new Uint8Array([1, 2, 3]), size: 1 } });

    const [reply] = await amy.replies(thread, since);

    expect(reply!.files).toEqual([]);
    expect(reply!.text).toContain("[big.bin was not downloaded");
  });
});

describe("the token", () => {
  it("appears in no file the plugin writes", async () => {
    const telegram = botApiStandIn();
    const { amy, directory } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    await amy.post(thread, { text: "- Which currency?" });
    const since = askedAt(telegram);
    telegram.say("BRL", { topic: Number(thread.id), file: { name: "total.png", bytes: new TextEncoder().encode("a picture") } });
    await amy.replies(thread, since);

    const written = filesUnder(directory);
    expect(written.length).toBeGreaterThan(2);
    for (const file of written) expect(fs.readFileSync(file, "utf-8")).not.toContain(TOKEN);
  });

  it("is in no error Telegram's refusal or an unreachable server produces", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);
    await expect(amy.post({ id: "999" }, { text: "hello" })).rejects.toThrow(/sendMessage refused: 400 Bad Request: message thread not found/);

    const unreachable = new BotApi(TOKEN, { transport: async (request) => { throw new Error(`connect ECONNREFUSED ${request.url}`); } });
    const error = await unreachable.call("getMe").catch((caught: Error) => caught);
    expect(String(error)).toMatch(/telegram getMe could not be reached/);
    expect(String(error)).not.toContain(TOKEN);
  });
});

describe("flood control", () => {
  it("waits out a 429 for as long as Telegram says, then carries on", async () => {
    const telegram = botApiStandIn();
    let limited = true;
    const waits: number[] = [];
    const api = new BotApi(TOKEN, {
      transport: async (request) => {
        if (limited) {
          limited = false;
          return { status: 429, body: new TextEncoder().encode(JSON.stringify({ ok: false, error_code: 429, description: "Too Many Requests: retry after 3", parameters: { retry_after: 3 } })) };
        }
        return telegram.transport(request);
      },
      sleep: async (ms) => void waits.push(ms),
    });

    await expect(api.call("getMe")).resolves.toMatchObject({ username: "amy_work_bot" });
    expect(waits).toEqual([3000]);
  });
});

function filesUnder(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

describe("what is not an answer", () => {
  it("files no reply for a topic renamed, which says nothing", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    telegram.say("Total, renamed", { topic: Number(thread.id), renamesTopic: true });

    expect(await amy.replies(thread, since)).toEqual([]);
    expect(telegram.pending()).toBe(0);
  });

  it("opens a topic for a work id the map's prototype also has", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);

    const thread = await amy.open("constructor", "A plan named constructor");

    expect(telegram.topics.get(Number(thread.id))).toBe("A plan named constructor");
  });
});

describe("what is kept on disk", () => {
  it("skips a line left half written, and files its reply again", async () => {
    const telegram = botApiStandIn();
    const { amy, directory } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    fs.mkdirSync(path.join(directory, "inbox"), { recursive: true });
    fs.writeFileSync(path.join(directory, "inbox", `${thread.id}.jsonl`), '{"messageId":1,"at":"20');
    telegram.say("BRL", { topic: Number(thread.id) });

    expect((await amy.replies(thread, since)).map((reply) => reply.text)).toEqual(["BRL"]);
  });

  it("does not send an offset Telegram's restarted update ids have passed", async () => {
    const telegram = botApiStandIn();
    const { amy, directory } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    telegram.say("first", { topic: Number(thread.id) });
    const [first] = await amy.replies(thread, new Date(0).toISOString());
    // A week with no updates: the kept offset is old, and Telegram numbers anew below it.
    const kept = JSON.parse(fs.readFileSync(path.join(directory, "offset.json"), "utf-8")) as { offset: number };
    fs.writeFileSync(path.join(directory, "offset.json"), JSON.stringify({ offset: kept.offset, receivedAt: Date.now() - 7 * 24 * 60 * 60 * 1000 }));
    telegram.restartUpdateIds(100);
    telegram.say("BRL, after a quiet week", { topic: Number(thread.id) });

    expect((await amy.replies(thread, first!.at)).map((reply) => reply.text)).toEqual(["BRL, after a quiet week"]);
  });


  it("keeps one profile's topics apart from another's, and reads the bot's updates once for both", async () => {
    const telegram = botApiStandIn();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-phases-"));
    const api = new BotApi(TOKEN, { transport: telegram.transport });
    const shared = path.join(root, "bot");
    const brief = new TelegramConversation(api, { operator: String(OPERATOR), directory: path.join(root, "brief"), shared });
    const build = new TelegramConversation(api, { operator: String(OPERATOR), directory: path.join(root, "build"), shared });
    const briefThread = await brief.open("TBO-1", "Brief TBO-1");
    const buildThread = await build.open("TBO-1", "Build TBO-1");
    const since = askedAt(telegram);
    telegram.say("for the brief", { topic: Number(briefThread.id) });
    telegram.say("for the build", { topic: Number(buildThread.id) });

    // The build reads first, and with it confirms the brief's answer too.
    expect((await build.replies(buildThread, since)).map((reply) => reply.text)).toEqual(["for the build"]);
    expect((await brief.replies(briefThread, since)).map((reply) => reply.text)).toEqual(["for the brief"]);
    expect(briefThread).not.toEqual(buildThread);
  });
});

describe("one holder at a time", () => {
  it("renews its hold through a slow call, so nobody takes it over", async () => {
    const telegram = botApiStandIn();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-lease-"));
    const events: string[] = [];
    let slow = true;
    const api = new BotApi(TOKEN, {
      transport: async (request) => {
        if (slow && request.url.endsWith("/getUpdates")) {
          slow = false;
          events.push("slow read started");
          await new Promise((resolve) => setTimeout(resolve, 400));
          events.push("slow read finished");
        }
        if (request.url.endsWith("/createForumTopic")) events.push("topic created");
        return telegram.transport(request);
      },
    });
    const one = new TelegramConversation(api, { operator: String(OPERATOR), directory, leaseMs: 120 });
    const other = new TelegramConversation(api, { operator: String(OPERATOR), directory, leaseMs: 120 });
    const thread = await one.open("BILL-7", "Total");
    events.length = 0;

    const reading = one.replies(thread, askedAt(telegram));
    await new Promise((resolve) => setTimeout(resolve, 200));
    await other.open("BILL-8", "Credit note");
    await reading;

    expect(events).toEqual(["slow read started", "slow read finished", "topic created"]);
  });
});

describe("files Telegram will not hand over", () => {
  it("names one Telegram refuses as too big when the message did not say its size", async () => {
    const telegram = botApiStandIn({ largestFile: 2 });
    const { amy } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    telegram.say("the recording", { topic: Number(thread.id), file: { name: "call.mp4", bytes: new Uint8Array([1, 2, 3]), unsized: true } });

    const [reply] = await amy.replies(thread, since);

    expect(reply!.files).toEqual([]);
    expect(reply!.text).toContain("[call.mp4 was not downloaded");
  });

  it("keeps the token out of a refusal whose description echoes it", async () => {
    const api = new BotApi(TOKEN, {
      transport: async (request) => ({ status: 400, body: new TextEncoder().encode(JSON.stringify({ ok: false, error_code: 400, description: `Bad Request: ${request.url}` })) }),
    });

    const error = await api.call("getMe").catch((caught: Error) => caught);

    expect(String(error)).toContain("<token>");
    expect(String(error)).not.toContain(TOKEN);
  });
});

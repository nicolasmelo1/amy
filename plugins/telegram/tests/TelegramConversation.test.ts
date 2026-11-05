import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
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

/** Telegram told every update was read, as a reader that kept them does. */
async function confirmEverything(telegram: BotApiStandIn): Promise<void> {
  await telegram.transport({ url: `https://api.telegram.org/bot${TOKEN}/getUpdates`, method: "POST", headers: {}, body: JSON.stringify({ offset: 2_000_000_000 }) });
  expect(telegram.pending()).toBe(0);
}

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
  it("files again a reply whose file does not parse", async () => {
    const telegram = botApiStandIn();
    const { amy, directory } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    const said = telegram.say("BRL", { topic: Number(thread.id) });
    const identity = fs.readFileSync(path.join(directory, "identity"), "utf-8");
    const inbox = path.join(directory, `inbox-${identity}`, thread.id);
    fs.mkdirSync(inbox, { recursive: true });
    fs.writeFileSync(path.join(inbox, `${said.message_id}.json`), '{"messageId":1,"at":"20');

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

describe("the second review", () => {
  it("takes a photo's largest size by its dimensions when no size says its bytes", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    telegram.say("the screen", { topic: Number(thread.id), photo: true, file: { name: "photo", bytes: new Uint8Array([4, 5, 6]) } });

    const [reply] = await amy.replies(thread, since);

    expect([...fs.readFileSync(reply!.files[0]!)]).toEqual([4, 5, 6]);
  });

  it("fails the look, not the attachment, when getFile gives no path to download", async () => {
    const telegram = botApiStandIn({ noFilePath: true });
    const { amy } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    telegram.say("see", { topic: Number(thread.id), file: { name: "total.png", bytes: new Uint8Array([1]) } });

    await expect(amy.replies(thread, since)).rejects.toThrow(/gave no path to download total.png/);
  });

  it("reads a file a local Bot API server keeps on a shared disk, and says so when it cannot", async () => {
    const local = fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-local-"));
    const telegram = botApiStandIn({ localFiles: local });
    const { amy } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    telegram.say("see", { topic: Number(thread.id), file: { name: "total.png", bytes: new Uint8Array([7, 7]) } });

    const [reply] = await amy.replies(thread, since);
    expect([...fs.readFileSync(reply!.files[0]!)]).toEqual([7, 7]);

    const elsewhere = botApiStandIn({ localFiles: local });
    const { amy: other } = amyWith(elsewhere);
    const otherThread = await other.open("BILL-8", "Credit");
    const otherSince = askedAt(elsewhere);
    elsewhere.say("see", { topic: Number(otherThread.id), file: { name: "note.png", bytes: new Uint8Array([1]) } });
    fs.rmSync(local, { recursive: true, force: true });
    fs.mkdirSync(local);
    fs.chmodSync(local, 0o000);
    try {
      await expect(other.replies(otherThread, otherSince)).rejects.toThrow();
    } finally {
      fs.chmodSync(local, 0o700);
    }
  });

  it("keeps a file whose name is nearly as long as a file name may be", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    const name = `${"n".repeat(220)}.pdf`;
    telegram.say("the contract", { topic: Number(thread.id), file: { name, bytes: new Uint8Array([1]) } });

    const [reply] = await amy.replies(thread, since);

    expect(path.basename(reply!.files[0]!)).toBe(name);
  });

  it("never splits a character, and sends no empty last part", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "😀".repeat(70));

    await amy.post(thread, { text: `${"a".repeat(4095)}😀b` });
    await amy.post(thread, { text: `${"c".repeat(4096)}\n` });

    expect(telegram.sent.map((message) => message.text)).toEqual([`${"a".repeat(4095)}`, "😀b", "c".repeat(4096)]);
    const [name] = [...telegram.topics.values()];
    // A lone surrogate does not survive a round trip through UTF-8.
    expect(Buffer.from(name!, "utf8").toString("utf8")).toBe(name);
  });

  it("forgets a removed profile's replies and files, and confirms its topic's messages without keeping them", async () => {
    const telegram = botApiStandIn();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-remove-"));
    const api = new BotApi(TOKEN, { transport: telegram.transport });
    const shared = path.join(root, "bot");
    const brief = new TelegramConversation(api, { operator: String(OPERATOR), directory: path.join(root, "brief"), shared });
    const build = new TelegramConversation(api, { operator: String(OPERATOR), directory: path.join(root, "build"), shared });
    const briefThread = await brief.open("TBO-1", "Brief TBO-1");
    const buildThread = await build.open("TBO-1", "Build TBO-1");
    const since = askedAt(telegram);
    telegram.say("for the brief", { topic: Number(briefThread.id), file: { name: "notes.txt", bytes: new Uint8Array([1]) } });
    expect(await brief.replies(briefThread, since)).toHaveLength(1);

    // The phase is removed, the way amy remove does: its directory goes.
    fs.rmSync(path.join(root, "brief"), { recursive: true, force: true });
    telegram.say("still for the brief", { topic: Number(briefThread.id) });
    telegram.say("for the build", { topic: Number(buildThread.id) });

    expect((await build.replies(buildThread, since)).map((reply) => reply.text)).toEqual(["for the build"]);
    expect(telegram.pending()).toBe(0);
    expect(fs.existsSync(path.join(root, "brief"))).toBe(false);
    expect(fs.readdirSync(shared).filter((name) => !/^owners$|^offset\.json$/.test(name))).toEqual([]);
  });
});

describe("a server that never finishes answering", () => {
  it("is cut off at the deadline, body included, and the token is not in the error", async () => {
    const http = await import("node:http");
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.write("{");
      // And nothing more, ever.
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const api = new BotApi(TOKEN, { server: `http://127.0.0.1:${port}`, deadlineMs: 200 });
      const started = Date.now();
      const error = await api.call("getUpdates").catch((caught: Error) => caught);

      expect(String(error)).toMatch(/telegram getUpdates could not be reached/);
      expect(String(error)).not.toContain(TOKEN);
      expect(Date.now() - started).toBeLessThan(5_000);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});

describe("the third review", () => {
  it("finds a topic's owner after the state root is moved", async () => {
    const telegram = botApiStandIn();
    const before = fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-moved-"));
    const api = new BotApi(TOKEN, { transport: telegram.transport });
    const at = (root: string) => new TelegramConversation(api, { operator: String(OPERATOR), directory: path.join(root, "build"), shared: path.join(root, "bot") });
    const thread = await at(before).open("TBO-1", "Build TBO-1");
    const since = askedAt(telegram);
    const after = `${before}-moved`;
    fs.renameSync(before, after);
    telegram.say("BRL", { topic: Number(thread.id) });

    expect((await at(after).replies(thread, since)).map((reply) => reply.text)).toEqual(["BRL"]);
  });

  it("gives a profile made again at a removed one's path none of its old topics' replies", async () => {
    const telegram = botApiStandIn();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-again-"));
    const api = new BotApi(TOKEN, { transport: telegram.transport });
    const build = () => new TelegramConversation(api, { operator: String(OPERATOR), directory: path.join(root, "build"), shared: path.join(root, "bot") });
    const old = await build().open("TBO-1", "Build TBO-1");
    fs.rmSync(path.join(root, "build"), { recursive: true, force: true });
    const again = build();
    const fresh = await again.open("TBO-2", "Build TBO-2");
    const since = askedAt(telegram);
    telegram.say("for the old phase", { topic: Number(old.id) });

    expect(await again.replies(fresh, since)).toEqual([]);
    expect(await again.replies(old, since)).toEqual([]);
    expect(telegram.pending()).toBe(0);
  });
});

describe("the fourth review", () => {
  it("loses no reply when a reader passed over by another files the same updates late", async () => {
    const telegram = botApiStandIn();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-late-"));
    let slow = true;
    const late = new BotApi(TOKEN, {
      transport: async (request) => {
        const answer = await telegram.transport(request);
        if (slow && request.url.endsWith("/getUpdates")) {
          slow = false;
          // Paused past its hold, holding the updates it already read.
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        return answer;
      },
    });
    const prompt = new BotApi(TOKEN, { transport: telegram.transport });
    const one = new TelegramConversation(late, { operator: String(OPERATOR), directory, leaseMs: 50 });
    const other = new TelegramConversation(prompt, { operator: String(OPERATOR), directory, leaseMs: 50 });
    const thread = await other.open("BILL-7", "Total");
    const since = askedAt(telegram);
    telegram.say("BRL", { topic: Number(thread.id) });
    telegram.say("and no rounding", { topic: Number(thread.id) });

    const reading = one.replies(thread, since);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await other.replies(thread, since);
    await reading;

    expect((await other.replies(thread, since)).map((reply) => reply.text)).toEqual(["BRL", "and no rounding"]);
    expect(telegram.pending()).toBe(0);
  });

  it("confirms nothing when a profile's identity cannot be read", async () => {
    const telegram = botApiStandIn();
    const { amy, directory } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    telegram.say("BRL", { topic: Number(thread.id) });
    fs.chmodSync(path.join(directory, "identity"), 0o000);
    try {
      await expect(amy.replies(thread, since)).rejects.toThrow();
      expect(telegram.pending()).toBe(1);
    } finally {
      fs.chmodSync(path.join(directory, "identity"), 0o600);
    }
    expect((await amy.replies(thread, since)).map((reply) => reply.text)).toEqual(["BRL"]);
  });

  it("never says a local Bot API server's path, which may carry the token", async () => {
    const local = fs.mkdtempSync(path.join(os.tmpdir(), `amy-${TOKEN.replace(":", "-")}-`));
    const telegram = botApiStandIn({ localFiles: local, localFilesElsewhere: true });
    const { amy } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    telegram.say("see", { topic: Number(thread.id), file: { name: "total.png", bytes: new Uint8Array([1]) } });

    const error = (await amy.replies(thread, since).then(() => undefined, (caught: Error) => caught))!;
    expect(String(error)).toMatch(/must share that disk/);
    expect(String(error)).not.toContain(local);
    expect(String(error.cause ?? "")).not.toContain(local);
  });

  it("reads the operator however the config spelled the id", async () => {
    const telegram = botApiStandIn();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-zeros-"));
    const amy = new TelegramConversation(new BotApi(TOKEN, { transport: telegram.transport }), { operator: `00${OPERATOR}`, directory });
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    telegram.say("BRL", { topic: Number(thread.id) });

    expect((await amy.replies(thread, since)).map((reply) => reply.text)).toEqual(["BRL"]);
  });
});

describe("the fifth review", () => {
  it("keeps the first filing of a reply, and its time, when a late reader files it again", async () => {
    const telegram = botApiStandIn();
    const { amy, directory } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    const said = telegram.say("BRL", { topic: Number(thread.id) });
    const identity = fs.readFileSync(path.join(directory, "identity"), "utf-8");
    const inbox = path.join(directory, `inbox-${identity}`, thread.id);
    fs.mkdirSync(inbox, { recursive: true });
    const first = { messageId: said.message_id, at: new Date(Date.now() + 60_000).toISOString(), author: String(OPERATOR), text: "BRL", files: [] };
    fs.writeFileSync(path.join(inbox, `${said.message_id}.json`), JSON.stringify(first));

    const [reply] = await amy.replies(thread, since);

    expect(reply!.at).toBe(first.at);
  });

  it("reads one bot's updates once for two operators, and gives each operator's answer to its own topic", async () => {
    const telegram = botApiStandIn();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-operators-"));
    const api = new BotApi(TOKEN, { transport: telegram.transport });
    const shared = path.join(root, "bot");
    const ada = new TelegramConversation(api, { operator: String(OPERATOR), directory: path.join(root, "ada"), shared });
    const grace = new TelegramConversation(api, { operator: String(SOMEBODY_ELSE), directory: path.join(root, "grace"), shared });
    const adas = await ada.open("BILL-7", "Ada's");
    const graces = await grace.open("BILL-8", "Grace's");
    const since = askedAt(telegram);
    telegram.say("for Grace's work", { topic: Number(graces.id), from: SOMEBODY_ELSE });
    telegram.say("for Ada's work", { topic: Number(adas.id) });

    // Ada's process reads first, and with it confirms Grace's answer too.
    expect((await ada.replies(adas, since)).map((reply) => reply.text)).toEqual(["for Ada's work"]);
    expect((await grace.replies(graces, since)).map((reply) => reply.text)).toEqual(["for Grace's work"]);
  });

  it("opens a topic for a work id whose spelt-out name would be too long for a file", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);
    const id = "é".repeat(43);

    const thread = await amy.open(id, "A long name");

    expect(await amy.open(id, "A long name")).toEqual(thread);
    expect(await amy.open(`${id}x`, "Another")).not.toEqual(thread);
  });
});

describe("the sixth review", () => {
  it("keeps the token out of an error that carries it URI-encoded", async () => {
    const api = new BotApi(TOKEN, {
      transport: async () => { throw new Error(`connect ECONNREFUSED https://proxy.test/bot${encodeURIComponent(TOKEN).toLowerCase()}/getMe`); },
    });

    const error = await api.call("getMe").catch((caught: Error) => caught);

    expect(String(error)).not.toContain(encodeURIComponent(TOKEN));
    expect(String(error).toLowerCase()).not.toContain(encodeURIComponent(TOKEN).toLowerCase());
  });

  it("keeps a reply that arrives before its topic's owner is recorded, and files it once it is", async () => {
    const telegram = botApiStandIn();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-unowned-"));
    const shared = path.join(root, "bot");
    let answerEarly = true;
    const late: { reader?: TelegramConversation } = {};
    const api = new BotApi(TOKEN, {
      transport: async (request) => {
        const answer = await telegram.transport(request);
        if (answerEarly && request.url.endsWith("/createForumTopic")) {
          answerEarly = false;
          // The operator answers, and another process reads it, before this one records the topic.
          const topic = (JSON.parse(new TextDecoder().decode(answer.body)) as { result: { message_thread_id: number } }).result.message_thread_id;
          telegram.say("BRL, said at once", { topic });
          // Paused past its lease: the hold is taken over, as a stale one is.
          fs.rmSync(path.join(shared, "lock"), { recursive: true, force: true });
          await late.reader!.replies({ id: String(topic) }, new Date(0).toISOString());
        }
        return answer;
      },
    });
    const opener = new TelegramConversation(api, { operator: String(OPERATOR), directory: path.join(root, "build"), shared, leaseMs: 20 });
    late.reader = new TelegramConversation(new BotApi(TOKEN, { transport: telegram.transport }), { operator: String(OPERATOR), directory: path.join(root, "other"), shared, lockWaitMs: 5_000, leaseMs: 20 });

    const thread = await opener.open("TBO-1", "Build TBO-1");

    expect(telegram.pending()).toBe(0);
    expect((await opener.replies(thread, new Date(0).toISOString())).map((reply) => reply.text)).toEqual(["BRL, said at once"]);
  });

  it("files a reply beside one somebody damaged, never deleting it", async () => {
    const telegram = botApiStandIn();
    const { amy, directory } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    const said = telegram.say("BRL", { topic: Number(thread.id) });
    const identity = fs.readFileSync(path.join(directory, "identity"), "utf-8");
    const inbox = path.join(directory, `inbox-${identity}`, thread.id);
    fs.mkdirSync(inbox, { recursive: true });
    fs.writeFileSync(path.join(inbox, `${said.message_id}.json`), "damaged");

    expect((await amy.replies(thread, since)).map((reply) => reply.text)).toEqual(["BRL"]);
    expect(fs.readFileSync(path.join(inbox, `${said.message_id}.json`), "utf-8")).toBe("damaged");
  });

  it("keeps work ids that differ only in case as two topics", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);

    const lower = await amy.open("build", "build");
    const upper = await amy.open("Build", "Build");

    expect(lower).not.toEqual(upper);
  });

  it("makes nothing again for a profile removed while its topic was being opened", async () => {
    const telegram = botApiStandIn();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-removed-"));
    const directory = path.join(root, "build");
    const api = new BotApi(TOKEN, {
      transport: async (request) => {
        if (request.url.endsWith("/createForumTopic")) fs.rmSync(directory, { recursive: true, force: true });
        return telegram.transport(request);
      },
    });
    const amy = new TelegramConversation(api, { operator: String(OPERATOR), directory, shared: path.join(root, "bot") });

    await expect(amy.open("TBO-1", "Build TBO-1")).rejects.toThrow(/was removed while its topic was being opened/);
    expect(fs.existsSync(directory)).toBe(false);
  });

  it("reads a reply marked /decide as the decision and /discuss as a turn, without the mark", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    telegram.say("why BRL?", { topic: Number(thread.id) });
    telegram.say("/discuss what about EUR?", { topic: Number(thread.id) });
    telegram.say("/decide BRL, beside the total", { topic: Number(thread.id) });
    telegram.say("✅ and no rounding", { topic: Number(thread.id) });

    const replies = await amy.replies(thread, since);

    expect(replies.map((reply) => [reply.text, reply.kind])).toEqual([
      ["why BRL?", undefined],
      ["what about EUR?", "discussion"],
      ["BRL, beside the total", "decision"],
      ["and no rounding", "decision"],
    ]);
  });
});

describe("the seventh review", () => {
  it("adopts replies kept for a topic when its opener stopped before adopting them", async () => {
    const telegram = botApiStandIn();
    const { amy, directory } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    // What a reader kept while the opener had recorded the topic and not yet adopted.
    const waiting = path.join(directory, "unowned", `${OPERATOR}-${thread.id}`);
    fs.mkdirSync(waiting, { recursive: true });
    const said = telegram.say("BRL", { topic: Number(thread.id) });
    await confirmEverything(telegram); // as the reader that kept it did
    fs.writeFileSync(path.join(waiting, `${said.message_id}.json`), JSON.stringify(said));

    await amy.open("BILL-7", "Total");

    expect((await amy.replies(thread, new Date(0).toISOString())).map((reply) => reply.text)).toEqual(["BRL"]);
  });

  it("files one reply once when two readers file it at once", async () => {
    const telegram = botApiStandIn();
    const { amy, directory } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    telegram.say("BRL", { topic: Number(thread.id) });
    const other = amyWith(telegram, directory).amy;

    await Promise.all([amy.replies(thread, since).catch(() => []), other.replies(thread, since).catch(() => [])]);

    expect((await amy.replies(thread, since)).map((reply) => reply.text)).toEqual(["BRL"]);
  });

  it("orders replies in one second by the order they were written, whoever filed them first", async () => {
    const telegram = botApiStandIn();
    const { amy, directory } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const first = telegram.say("BRL", { topic: Number(thread.id) });
    const second = telegram.say("and no rounding", { topic: Number(thread.id) });
    second.date = first.date;
    const waiting = path.join(directory, "unowned", `${OPERATOR}-${thread.id}`);
    fs.mkdirSync(waiting, { recursive: true });
    // Kept out of order, and listed out of order.
    fs.writeFileSync(path.join(waiting, `${second.message_id}.json`), JSON.stringify(second));
    fs.writeFileSync(path.join(waiting, `${first.message_id}.json`), JSON.stringify(first));
    await confirmEverything(telegram);

    await amy.open("BILL-7", "Total");
    const replies = await amy.replies(thread, new Date(Number(first.date) * 1000 + 500).toISOString());

    expect(replies.map((reply) => reply.text)).toEqual(["BRL", "and no rounding"]);
    expect(await amy.replies(thread, replies[0]!.at)).toHaveLength(1);
  });

  it("keeps nothing from a topic nobody is opening in a chat no profile owns", async () => {
    const telegram = botApiStandIn();
    const { amy, directory } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    telegram.say("hello from a topic amy never opened", { topic: 999 });

    await amy.replies(thread, askedAt(telegram));

    expect(fs.existsSync(path.join(directory, "unowned"))).toBe(false);
    expect(telegram.pending()).toBe(0);
  });
});

describe("the eighth review", () => {
  it("files a reply whose topic's owner was recorded while the reader was looking for an opening", async () => {
    const telegram = botApiStandIn();
    const { amy, directory } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const since = askedAt(telegram);
    telegram.say("BRL", { topic: Number(thread.id) });
    // The reader finds no owner, as if it looked just before the opener recorded it.
    const ownerFile = path.join(directory, "owners", `${OPERATOR}-${thread.id}.json`);
    const owner = fs.readFileSync(ownerFile, "utf-8");
    fs.rmSync(ownerFile);
    const readdir = fs.readdirSync;
    const spy = vi.spyOn(fs, "readdirSync").mockImplementation(((target: fs.PathLike, ...rest: unknown[]) => {
      // The opener records the owner and closes its opening while the reader looks for one.
      if (String(target).includes(`${path.sep}opening${path.sep}`)) fs.writeFileSync(ownerFile, owner);
      return (readdir as (...args: unknown[]) => unknown)(target, ...rest);
    }) as typeof fs.readdirSync);
    try {
      expect((await amy.replies(thread, since)).map((reply) => reply.text)).toEqual(["BRL"]);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("the ninth review", () => {
  it("does not take a reply written before a question, in the same second, as its answer", async () => {
    const telegram = botApiStandIn();
    const { amy } = amyWith(telegram);
    const thread = await amy.open("BILL-7", "Total");
    const earlier = telegram.say("/decide BRL", { topic: Number(thread.id) });
    // The machine's clock inside the second Telegram dated the earlier reply,
    // which is where the question is posted and asked: amy records each post
    // by that clock, and asks afterwards, as a workflow does once its question
    // is sent. Pinned, so the run never straddles a second.
    const second = Number(earlier.date) * 1000;
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(second + 100);
      await amy.post(thread, { text: "- And the tax line?" });
      vi.setSystemTime(second + 200);
      const asked = new Date().toISOString();
      const later = telegram.say("the tax line too", { topic: Number(thread.id) });
      // All three in one Telegram second; only the message ids still order them.
      later.date = earlier.date;

      const replies = await amy.replies(thread, asked);

      expect(replies.map((reply) => reply.text)).toEqual(["the tax line too"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

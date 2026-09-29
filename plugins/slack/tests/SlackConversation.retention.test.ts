import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HttpRequest, HttpResponse, SlackApi, SlackConversation } from "../src/index.js";

/**
 * What the plugin keeps on this machine goes away: by `forget` for one piece
 * of work, and by retention for everything nobody used in a while.
 */
const CHANNEL = "C0WORK";
const OPERATOR = "U0ADA";
const BOT = "U0AMYBOT";
const DAY = 24 * 60 * 60 * 1000;
const PICTURE = new Uint8Array([1, 2, 3]);

let directory: string;
let posted: number;
let downloads: number;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-slack-retention-"));
  posted = 0;
  downloads = 0;
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

/** A Slack whose every thread has one operator reply carrying one picture. */
async function answer(request: HttpRequest): Promise<HttpResponse> {
  const json = (value: unknown): HttpResponse => ({ status: 200, headers: {}, body: new TextEncoder().encode(JSON.stringify(value)) });
  if (request.url.startsWith("https://files.slack.com/")) {
    downloads += 1;
    return { status: 200, headers: {}, body: PICTURE };
  }
  switch (request.url.replace("https://slack.com/api/", "")) {
    case "chat.postMessage":
      posted += 1;
      return json({ ok: true, ts: `179000000${posted}.000100` });
    case "auth.test":
      return json({ ok: true, user_id: BOT });
    default: {
      const ts = new URLSearchParams(request.body ?? "").get("ts");
      return json({
        ok: true,
        has_more: false,
        messages: [{
          ts: "1790000100.000100",
          user: OPERATOR,
          text: "here",
          files: [{ id: `F0${ts!.slice(0, 10)}`, name: "shot.png", url_private: `https://files.slack.com/files-pri/T0/${ts}/shot.png` }],
        }],
      });
    }
  }
}

function slack(now: () => Date, retentionDays = 30): SlackConversation {
  return new SlackConversation(new SlackApi("xoxb-test", { transport: answer }), {
    channel: CHANNEL,
    operator: OPERATOR,
    directory,
    retentionDays,
    now,
  });
}

/** Makes every file under the state directory look last used `days` ago. */
function age(days: number): void {
  const then = new Date(Date.now() - days * DAY);
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else fs.utimesSync(full, then, then);
    }
  };
  walk(directory);
}

const SINCE = "2026-09-21T00:00:00.000Z";

describe("forgetting one piece of work", () => {
  it("removes its thread's memory and every file downloaded from it, and nothing of another's", async () => {
    const amy = slack(() => new Date());
    const one = await amy.open("ENG-1", "ENG-1");
    const two = await amy.open("ENG-2", "ENG-2");
    const [fromOne] = await amy.replies(one, SINCE);
    const [fromTwo] = await amy.replies(two, SINCE);

    amy.forget("ENG-1");

    expect(fs.existsSync(fromOne!.files[0]!)).toBe(false);
    expect(fs.existsSync(fromTwo!.files[0]!)).toBe(true);
    expect(await amy.open("ENG-2", "ENG-2")).toEqual(two);
    // The thread stays in Slack; this machine no longer knows it, so a new one opens.
    expect(await amy.open("ENG-1", "ENG-1")).not.toEqual(one);
    expect(posted).toBe(3);
  });

  it("is harmless for work it never knew", () => {
    expect(() => slack(() => new Date()).forget("ENG-404")).not.toThrow();
  });
});

describe("retention", () => {
  it("removes a downloaded file nobody used within it, and fetches it again when its reply is read", async () => {
    const amy = slack(() => new Date());
    const thread = await amy.open("ENG-1", "ENG-1");
    const [first] = await amy.replies(thread, SINCE);
    age(31);
    // The thread was used today; only the picture is old.
    await amy.open("ENG-1", "ENG-1");

    expect(amy.prune(new Date())).toEqual({ threads: 0, files: 1 });
    expect(fs.existsSync(first!.files[0]!)).toBe(false);

    const [again] = await amy.replies(thread, SINCE);
    expect(new Uint8Array(fs.readFileSync(again!.files[0]!))).toEqual(PICTURE);
    expect(downloads).toBe(2);
  });

  it("keeps a file that was read again recently, however long ago it was downloaded", async () => {
    const amy = slack(() => new Date());
    const thread = await amy.open("ENG-1", "ENG-1");
    await amy.replies(thread, SINCE);
    age(31);
    await amy.open("ENG-1", "ENG-1");
    const [again] = await amy.replies(thread, SINCE);

    expect(amy.prune(new Date())).toEqual({ threads: 0, files: 0 });
    expect(fs.existsSync(again!.files[0]!)).toBe(true);
    expect(downloads).toBe(1);
  });

  it("forgets a thread nobody used within it, with its files, and keeps one still in use", async () => {
    const amy = slack(() => new Date());
    const old = await amy.open("ENG-1", "ENG-1");
    const [oldReply] = await amy.replies(old, SINCE);
    age(31);
    const fresh = await amy.open("ENG-2", "ENG-2");

    expect(amy.prune(new Date())).toEqual({ threads: 1, files: 0 });
    expect(fs.existsSync(oldReply!.files[0]!)).toBe(false);
    expect(await amy.open("ENG-2", "ENG-2")).toEqual(fresh);
  });

  it("never forgets an attempt whose owner is still posting, however old", async () => {
    const chain = path.join(directory, "threads", Buffer.from("ENG-1").toString("base64url"));
    fs.mkdirSync(chain, { recursive: true });
    fs.writeFileSync(path.join(chain, "1.json"), JSON.stringify({ channel: CHANNEL, pendingSince: 0, owner: `${process.pid}:posting` }));
    age(365);

    expect(slack(() => new Date()).prune(new Date()).threads).toBe(0);
    expect(fs.existsSync(path.join(chain, "1.json"))).toBe(true);
  });

  it("keeps everything when it is zero", async () => {
    const amy = slack(() => new Date(), 0);
    await amy.replies(await amy.open("ENG-1", "ENG-1"), SINCE);
    age(3650);

    expect(amy.prune(new Date())).toEqual({ threads: 0, files: 0 });
  });

  it("runs on its own as the plugin is used, at most once an hour", async () => {
    let now = new Date();
    const amy = slack(() => now);
    const thread = await amy.open("ENG-1", "ENG-1");
    const [reply] = await amy.replies(thread, SINCE);
    age(31);

    // The first use already pruned (nothing was old then); within the hour, no walk.
    now = new Date(now.getTime() + 30 * 60 * 1000);
    await amy.open("ENG-2", "ENG-2");
    expect(fs.existsSync(reply!.files[0]!)).toBe(true);

    now = new Date(now.getTime() + 31 * 60 * 1000);
    await amy.open("ENG-2", "ENG-2");
    expect(fs.existsSync(reply!.files[0]!)).toBe(false);
  });
});

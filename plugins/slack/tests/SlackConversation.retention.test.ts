import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("refuses while that work's root is being posted, so the post never loses its memory", async () => {
    let release!: () => void;
    const slow = new Promise<void>((resolve) => { release = resolve; });
    const amy = new SlackConversation(new SlackApi("xoxb-test", {
      transport: async (request) => {
        if (request.url.endsWith("/chat.postMessage")) await slow;
        return answer(request);
      },
    }), { channel: CHANNEL, operator: OPERATOR, directory });

    const opening = amy.open("ENG-1", "ENG-1");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(() => amy.forget("ENG-1")).toThrow(/being opened right now/);
    release();
    const thread = await opening;

    // The root was remembered after all, so opening again reuses it.
    expect(await amy.open("ENG-1", "ENG-1")).toEqual(thread);
    expect(posted).toBe(1);
  });

  it("keeps a download that was in flight from bringing a forgotten thread's file back", async () => {
    let release!: () => void;
    const slow = new Promise<void>((resolve) => { release = resolve; });
    const amy = new SlackConversation(new SlackApi("xoxb-test", {
      transport: async (request) => {
        if (request.url.startsWith("https://files.slack.com/")) await slow;
        return answer(request);
      },
    }), { channel: CHANNEL, operator: OPERATOR, directory });
    const thread = await amy.open("ENG-1", "ENG-1");

    const reading = amy.replies(thread, SINCE);
    await new Promise((resolve) => setTimeout(resolve, 20));
    amy.forget("ENG-1");
    release();
    const [reply] = await reading;

    expect(reply!.files).toEqual([]);
    expect(fs.existsSync(path.join(directory, "files", thread.id))).toBe(false);
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

  it("never forgets an attempt whose owner still holds its lease, however long ago it began", () => {
    const chain = path.join(directory, "threads", Buffer.from("ENG-1").toString("base64url"));
    fs.mkdirSync(chain, { recursive: true });
    fs.writeFileSync(path.join(chain, "1.json"), JSON.stringify({ channel: CHANNEL, pendingSince: 0, owner: `${process.pid}:posting` }));

    // A month from now by the prune's clock; the lease was renewed just now.
    expect(slack(() => new Date()).prune(new Date(Date.now() + 31 * DAY)).threads).toBe(0);
    expect(fs.existsSync(path.join(chain, "1.json"))).toBe(true);
  });

  it("keeps a thread whose replies are read, even by a caller that never opens it again", async () => {
    const amy = slack(() => new Date());
    const thread = await amy.open("ENG-1", "ENG-1");
    age(31);

    // Held on to by the caller, as a port consumer may: no open, only replies.
    await amy.replies(thread, SINCE);

    expect(amy.prune(new Date()).threads).toBe(0);
    expect(await slack(() => new Date()).open("ENG-1", "ENG-1")).toEqual(thread);
  });

  it("keeps a thread that is only posted to, by a caller that never opens it again", async () => {
    const amy = slack(() => new Date());
    const thread = await amy.open("ENG-1", "ENG-1");
    age(31);

    await amy.post(thread, { text: "still here" });

    expect(amy.prune(new Date()).threads).toBe(0);
    expect(await slack(() => new Date()).open("ENG-1", "ENG-1")).toEqual(thread);
  });

  it("reads a chain removed between two looks as empty, instead of failing", async () => {
    const amy = slack(() => new Date());
    const thread = await amy.open("ENG-1", "ENG-1");
    const chain = path.join(directory, "threads", Buffer.from("ENG-1").toString("base64url"));
    const readdir = fs.readdirSync;
    const spy = vi.spyOn(fs, "readdirSync").mockImplementation(((dir: fs.PathLike, options?: unknown) => {
      if (String(dir) === chain) {
        const gone = new Error("gone") as NodeJS.ErrnoException;
        gone.code = "ENOENT";
        throw gone;
      }
      return (readdir as (d: fs.PathLike, o?: unknown) => unknown)(dir, options);
    }) as typeof fs.readdirSync);

    try {
      await expect(amy.replies(thread, SINCE)).resolves.toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("prunes on its own for a caller that only posts, and never the thread it posts to", async () => {
    const amy = slack(() => new Date());
    const idle = await amy.open("ENG-9", "ENG-9");
    const [idleReply] = await amy.replies(idle, SINCE);
    const active = await amy.open("ENG-1", "ENG-1");
    age(31);

    // A fresh process, so its first call is the one that prunes.
    const later = slack(() => new Date());
    await later.post(active, { text: "still here" });

    expect(fs.existsSync(idleReply!.files[0]!)).toBe(false);
    expect(await slack(() => new Date()).open("ENG-1", "ENG-1")).toEqual(active);
  });

  it("never lets the prune take the thread whose replies are being read right now", async () => {
    const amy = slack(() => new Date());
    const thread = await amy.open("ENG-1", "ENG-1");
    age(31);

    // A fresh process whose first call is this read: it marks, then prunes.
    const [reply] = await slack(() => new Date()).replies(thread, SINCE);

    expect(fs.existsSync(reply!.files[0]!)).toBe(true);
    expect(await slack(() => new Date()).open("ENG-1", "ENG-1")).toEqual(thread);
  });

  it("keeps a forgotten thread forgotten past retention, for a stale reference read later", async () => {
    const amy = slack(() => new Date());
    const thread = await amy.open("ENG-1", "ENG-1");
    await amy.replies(thread, SINCE);
    amy.forget("ENG-1");
    age(365);
    amy.prune(new Date());

    const [reply] = await amy.replies(thread, SINCE);

    expect(reply!.files).toEqual([]);
    expect(downloads).toBe(1);
  });

  it("puts back a file a reader touched between the prune's look and its removal", async () => {
    const amy = slack(() => new Date());
    const thread = await amy.open("ENG-1", "ENG-1");
    const [reply] = await amy.replies(thread, SINCE);
    const file = reply!.files[0]!;
    age(31);
    await amy.open("ENG-1", "ENG-1");
    // Another process reads the cached file just as the prune moves it.
    const rename = fs.renameSync;
    const spy = vi.spyOn(fs, "renameSync").mockImplementationOnce((from, to) => {
      const now = new Date();
      fs.utimesSync(file, now, now);
      rename(from, to);
    });

    try {
      expect(amy.prune(new Date()).files).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(new Uint8Array(fs.readFileSync(file))).toEqual(PICTURE);
  });

  it("ages an attachment that happens to be called .forgotten like any other", () => {
    const nested = path.join(directory, "files", "1790000001.000100", "F0REPORT");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, "report.forgotten"), "attached by the operator");
    fs.writeFileSync(path.join(directory, "files", "1790000002.000100.forgotten"), "");
    age(31);

    expect(slack(() => new Date()).prune(new Date()).files).toBe(1);
    expect(fs.existsSync(path.join(directory, "files", "1790000002.000100.forgotten"))).toBe(true);
  });

  it("refuses to forget an empty work id, which would name every thread", async () => {
    const amy = slack(() => new Date());
    const thread = await amy.open("ENG-1", "ENG-1");

    expect(() => amy.forget("")).toThrow(/work id is required/);
    await expect(amy.open("", "")).rejects.toThrow(/work id is required/);
    expect(await amy.open("ENG-1", "ENG-1")).toEqual(thread);
  });

  it("fetches a file again when it vanished between the look and the touch", async () => {
    const amy = slack(() => new Date());
    const thread = await amy.open("ENG-1", "ENG-1");
    const [first] = await amy.replies(thread, SINCE);
    fs.rmSync(first!.files[0]!);

    const [again] = await amy.replies(thread, SINCE);

    expect(new Uint8Array(fs.readFileSync(again!.files[0]!))).toEqual(PICTURE);
    expect(downloads).toBe(2);
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

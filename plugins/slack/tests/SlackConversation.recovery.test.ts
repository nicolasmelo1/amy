import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequest, HttpResponse, SlackApi, SlackConversation } from "../src/index.js";

/**
 * What the plugin keeps is private, and what a crash or a concurrent process
 * leaves half done is finished rather than left behind or repeated.
 */
const OPERATOR = "U0ADA";
const BOT = "U0AMYBOT";
const DAY = 24 * 60 * 60 * 1000;
const SINCE = "2026-09-21T00:00:00.000Z";
const DEAD = 2147483646;

let directory: string;
let posted: number;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-slack-recovery-"));
  posted = 0;
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

async function answer(request: HttpRequest): Promise<HttpResponse> {
  const json = (value: unknown): HttpResponse => ({ status: 200, headers: {}, body: new TextEncoder().encode(JSON.stringify(value)) });
  if (request.url.startsWith("https://files.slack.com/")) return { status: 200, headers: {}, body: new Uint8Array([7]) };
  switch (request.url.replace("https://slack.com/api/", "")) {
    case "chat.postMessage":
      posted += 1;
      return json({ ok: true, ts: `179000000${posted}.000100` });
    case "auth.test":
      return json({ ok: true, user_id: BOT });
    case "conversations.history":
      return json({ ok: true, messages: [], has_more: false });
    default: {
      const ts = new URLSearchParams(request.body ?? "").get("ts")!;
      return json({
        ok: true,
        has_more: false,
        messages: [{ ts: "1790000100.000100", user: OPERATOR, text: "here", files: [{ id: "F0SHOT", name: "shot.png", url_private: `https://files.slack.com/files-pri/T0/${ts}/shot.png` }] }],
      });
    }
  }
}

function slack(channel = "C0WORK", retentionDays = 30): SlackConversation {
  return new SlackConversation(new SlackApi("xoxb-test", { transport: answer }), { channel, operator: OPERATOR, directory, retentionDays });
}

function chainOf(workId: string): string {
  return path.join(directory, "threads", Buffer.from(workId).toString("base64url"));
}

function writeGeneration(workId: string, n: number, entry: Record<string, unknown>): void {
  fs.mkdirSync(chainOf(workId), { recursive: true });
  fs.writeFileSync(path.join(chainOf(workId), `${n}.json`), JSON.stringify(entry));
}

/** The one generation file a settled chain keeps, whatever its number. */
function onlyGeneration(workId: string): string {
  const [name] = fs.readdirSync(chainOf(workId));
  return path.join(chainOf(workId), name!);
}

function modeOf(file: string): number {
  return fs.statSync(file).mode & 0o777;
}

describe("what the plugin keeps is private", () => {
  it("makes its directories owner-only and its files owner-read, and tightens ones made looser before", async () => {
    fs.mkdirSync(path.join(directory, "files"), { recursive: true, mode: 0o755 });
    fs.chmodSync(path.join(directory, "files"), 0o755);
    const amy = slack();
    const thread = await amy.open("ENG-1", "ENG-1");
    const [reply] = await amy.replies(thread, SINCE);

    expect(modeOf(directory)).toBe(0o700);
    expect(modeOf(path.join(directory, "files"))).toBe(0o700);
    expect(modeOf(path.dirname(reply!.files[0]!))).toBe(0o700);
    expect(modeOf(reply!.files[0]!)).toBe(0o600);
    expect(modeOf(chainOf("ENG-1"))).toBe(0o700);
    expect(modeOf(onlyGeneration("ENG-1"))).toBe(0o600);
  });
});

describe("a use while a prune's tombstone stands", () => {
  it("makes the prune back off, so the thread in use stays remembered", async () => {
    const amy = slack();
    const thread = await amy.open("ENG-1", "ENG-1");
    const old = new Date(Date.now() - 40 * DAY);
    fs.utimesSync(onlyGeneration("ENG-1"), old, old);
    const other = slack();
    // Another process posts to the thread it holds just as the tombstone lands.
    const link = fs.linkSync;
    const spy = vi.spyOn(fs, "linkSync").mockImplementationOnce((from, to) => {
      link(from, to);
      void other.post(thread, { text: "still working on it" });
    });

    try {
      expect(amy.prune(new Date()).threads).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(await slack().open("ENG-1", "ENG-1")).toEqual(thread);
  });
});

describe("two prunes over the same files", () => {
  it("treats a file the other removed first as handled, and goes on with the rest", async () => {
    const shots = path.join(directory, "files", "1790000001.000100", "F0SHOT");
    fs.mkdirSync(shots, { recursive: true });
    for (const name of ["a.png", "b.png"]) fs.writeFileSync(path.join(shots, name), "x");
    const old = new Date(Date.now() - 40 * DAY);
    for (const name of ["a.png", "b.png"]) fs.utimesSync(path.join(shots, name), old, old);
    const stat = fs.statSync;
    const spy = vi.spyOn(fs, "statSync").mockImplementation(((file: fs.PathLike, options?: unknown) => {
      if (String(file).endsWith("a.png")) {
        fs.rmSync(file, { force: true });
        const gone = new Error("gone") as NodeJS.ErrnoException;
        gone.code = "ENOENT";
        throw gone;
      }
      return (stat as (f: fs.PathLike, o?: unknown) => fs.Stats)(file, options);
    }) as typeof fs.statSync);

    let result: { threads: number; files: number };
    try {
      result = slack().prune(new Date());
    } finally {
      spy.mockRestore();
    }
    expect(result.files).toBe(1);
    expect(fs.existsSync(shots)).toBe(false);
  });
});

describe("a mount moved to another channel", () => {
  it("drops the old channel's downloads once the new channel's root replaces it", async () => {
    const before = slack("C0OLD");
    const oldThread = await before.open("ENG-1", "ENG-1");
    const [reply] = await before.replies(oldThread, SINCE);

    const after = slack("C0NEW");
    const newThread = await after.open("ENG-1", "ENG-1");

    expect(newThread).not.toEqual(oldThread);
    expect(fs.existsSync(reply!.files[0]!)).toBe(false);
    expect(fs.existsSync(path.join(directory, "files", `${oldThread.id}.forgotten`))).toBe(true);
  });
});

describe("a forget that died half way", () => {
  it("adopts the thread under a dead tombstone instead of posting a second root", async () => {
    writeGeneration("ENG-1", 1, { channel: "C0WORK", ts: "1790000001.000100" });
    writeGeneration("ENG-1", 2, { tombstone: true, owner: `${DEAD}:gone`, covers: "1790000001.000100" });

    expect(await slack().open("ENG-1", "ENG-1")).toEqual({ id: "1790000001.000100" });
    expect(posted).toBe(0);
    expect(fs.readdirSync(chainOf("ENG-1"))).toEqual(["3.json"]);
  });

  it("is finished by a retry, which still names the root it covered", async () => {
    const amy = slack();
    const thread = await amy.open("ENG-1", "ENG-1");
    const [reply] = await amy.replies(thread, SINCE);
    const top = Math.max(...fs.readdirSync(chainOf("ENG-1")).map((name) => Number.parseInt(name, 10)));
    writeGeneration("ENG-1", top + 1, { tombstone: true, owner: `${DEAD}:gone`, covers: thread.id });

    amy.forget("ENG-1");

    // Only the released floor is left, so a generation number never comes back.
    const floor = JSON.parse(fs.readFileSync(onlyGeneration("ENG-1"), "utf8")) as Record<string, unknown>;
    expect(floor).toEqual({ tombstone: true, covers: thread.id });
    expect(fs.existsSync(reply!.files[0]!)).toBe(false);
  });

  it("has its files removed by the next prune, even when retention keeps everything", async () => {
    const amy = slack("C0WORK", 0);
    const thread = await amy.open("ENG-1", "ENG-1");
    const [reply] = await amy.replies(thread, SINCE);
    // The marker was written; the process died before removing the files.
    fs.writeFileSync(path.join(directory, "files", `${thread.id}.forgotten`), "");

    amy.prune(new Date());

    expect(fs.existsSync(reply!.files[0]!)).toBe(false);
  });
});

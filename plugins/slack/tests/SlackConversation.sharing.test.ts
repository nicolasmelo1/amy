import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequest, HttpResponse, SlackApi, SlackConversation } from "../src/index.js";

/**
 * The state directory is machine-wide, so every daemon that mounts this
 * plugin shares one thread map — and a crash can land between Slack taking a
 * root and the map remembering it.
 */
const CHANNEL = "C0WORK";
const OPERATOR = "U0ADA";
const BOT = "U0AMYBOT";

type Handler = (request: HttpRequest) => Promise<unknown> | unknown;

function slackAt(directory: string, handler: Handler, calls: HttpRequest[] = []): SlackConversation {
  const transport = async (request: HttpRequest): Promise<HttpResponse> => {
    calls.push(request);
    const answer = await handler(request);
    if (answer instanceof Uint8Array) return { status: 200, headers: {}, body: answer };
    return { status: 200, headers: {}, body: new TextEncoder().encode(JSON.stringify(answer)) };
  };
  const api = new SlackApi("xoxb-test", { transport, sleep: () => Promise.resolve() });
  return new SlackConversation(api, { channel: CHANNEL, operator: OPERATOR, directory, lockWaitMs: 5_000 });
}

function methodOf(request: HttpRequest): string {
  return request.url.replace("https://slack.com/api/", "");
}

function argsOf(request: HttpRequest): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(request.body ?? ""));
}

/** Where one work item's generations live, the way the plugin lays them out. */
function chainOf(workId: string): string {
  return path.join(directory, "threads", Buffer.from(workId).toString("base64url"));
}

function writeGeneration(workId: string, n: number, entry: Record<string, unknown>): void {
  fs.mkdirSync(chainOf(workId), { recursive: true });
  fs.writeFileSync(path.join(chainOf(workId), `${n}.json`), JSON.stringify(entry));
}

/** A pid nothing on this machine runs. */
const DEAD = 2147483646;

let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-slack-shared-"));
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("two processes sharing the thread map", () => {
  it("opens one thread when two of them open the same work at once", async () => {
    const calls: HttpRequest[] = [];
    let roots = 0;
    const handler: Handler = async (request) => {
      if (methodOf(request) !== "chat.postMessage") throw new Error(`unexpected ${request.url}`);
      await new Promise((resolve) => setTimeout(resolve, 30));
      roots += 1;
      return { ok: true, ts: `1790000000.00000${roots}` };
    };

    const [a, b] = await Promise.all([
      slackAt(directory, handler, calls).open("ENG-1", "ENG-1"),
      slackAt(directory, handler, calls).open("ENG-1", "ENG-1"),
    ]);

    expect(a).toEqual(b);
    expect(calls).toHaveLength(1);
  });

  it("keeps both threads when two of them open different work at once", async () => {
    let roots = 0;
    const handler: Handler = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      roots += 1;
      return { ok: true, ts: `1790000000.00000${roots}` };
    };

    const [one, two] = await Promise.all([
      slackAt(directory, handler).open("ENG-1", "ENG-1"),
      slackAt(directory, handler).open("ENG-2", "ENG-2"),
    ]);

    const restarted = slackAt(directory, () => { throw new Error("nothing should be posted"); });
    expect(await restarted.open("ENG-1", "ENG-1")).toEqual(one);
    expect(await restarted.open("ENG-2", "ENG-2")).toEqual(two);
  });
});

describe("an owner that died while posting", () => {
  it("is taken over by exactly one of several waiters, and the others adopt its thread", async () => {
    writeGeneration("ENG-1", 1, { channel: CHANNEL, pendingSince: 1790000000000, owner: `${DEAD}:gone` });
    let posted = 0;
    const handler: Handler = async (request) => {
      switch (methodOf(request)) {
        case "auth.test":
          return { ok: true, user_id: BOT };
        case "conversations.history":
          return { ok: true, messages: [], has_more: false };
        default:
          await new Promise((resolve) => setTimeout(resolve, 20));
          posted += 1;
          return { ok: true, ts: "1790000009.000100" };
      }
    };

    const opened = await Promise.all([1, 2, 3].map(() => slackAt(directory, handler).open("ENG-1", "ENG-1")));

    expect(posted).toBe(1);
    expect(new Set(opened.map((thread) => thread.id))).toEqual(new Set(["1790000009.000100"]));
    // Settled: the dead attempt is gone and nothing staged is left behind.
    expect(fs.readdirSync(chainOf("ENG-1"))).toEqual(["2.json"]);
  });

  it("loses the takeover to a process that created the same generation first, and waits for its thread", async () => {
    writeGeneration("ENG-1", 1, { channel: CHANNEL, pendingSince: 1790000000000, owner: `${DEAD}:gone` });
    // Another process wins generation 2 between this one reading the chain
    // and linking its own.
    const link = fs.linkSync;
    const spy = vi.spyOn(fs, "linkSync").mockImplementationOnce((from, to) => {
      writeGeneration("ENG-1", 2, { channel: CHANNEL, pendingSince: 1790000000000, owner: `${process.pid}:elsewhere` });
      link(from, to);
    });
    const slack = slackAt(directory, () => { throw new Error("the winner posts, not this one"); });

    try {
      const waiting = slack.open("ENG-1", "ENG-1");
      await new Promise((resolve) => setTimeout(resolve, 50));
      writeGeneration("ENG-1", 2, { channel: CHANNEL, ts: "1790000002.000100" });

      expect(await waiting).toEqual({ id: "1790000002.000100" });
    } finally {
      spy.mockRestore();
    }
  });

  it("is waited for, not taken over, while it is alive", async () => {
    writeGeneration("ENG-1", 1, { channel: CHANNEL, pendingSince: 1790000000000, owner: `${process.pid}:posting` });
    const slack = slackAt(directory, () => { throw new Error("a live owner's attempt must not be repeated"); });

    const waiting = slack.open("ENG-1", "ENG-1");
    await new Promise((resolve) => setTimeout(resolve, 50));
    writeGeneration("ENG-1", 1, { channel: CHANNEL, ts: "1790000001.000100" });

    expect(await waiting).toEqual({ id: "1790000001.000100" });
  });

  it("leaves its attempt released, not removed, when Slack refuses, so the next one recovers", async () => {
    const calls: HttpRequest[] = [];
    let first = true;
    const handler: Handler = (request) => {
      switch (methodOf(request)) {
        case "chat.postMessage":
          if (first) {
            first = false;
            return { ok: false, error: "fatal_error" };
          }
          return { ok: true, ts: "1790000009.000100" };
        case "auth.test":
          return { ok: true, user_id: BOT };
        default:
          return { ok: true, messages: [], has_more: false };
      }
    };
    const slack = slackAt(directory, handler, calls);

    await expect(slack.open("ENG-1", "ENG-1")).rejects.toThrow(/fatal_error/);
    expect(await slack.open("ENG-1", "ENG-1")).toEqual({ id: "1790000009.000100" });
    expect(calls.map(methodOf)).toEqual(["chat.postMessage", "auth.test", "conversations.history", "chat.postMessage"]);
  });
});

describe("a crash between Slack taking a root and the map remembering it", () => {
  const pendingSince = 1790000000000;

  beforeEach(() => {
    writeGeneration("ENG-1", 1, { channel: CHANNEL, pendingSince, owner: `${DEAD}:gone` });
  });

  it("adopts the root it finds for this work instead of posting a second, by work id and not by title", async () => {
    const calls: HttpRequest[] = [];
    const rootOf = (workId: string) => ({ event_type: "amy_work_thread", event_payload: { work_id: workId } });
    const handler: Handler = (request) => {
      switch (methodOf(request)) {
        case "auth.test":
          return { ok: true, user_id: BOT };
        case "conversations.history":
          return {
            ok: true,
            messages: [
              // Another item with the same title, and one posted by somebody else.
              { ts: "1790000004.000100", user: BOT, text: "ENG-1: renamed", metadata: rootOf("ENG-9") },
              { ts: "1790000003.000100", user: OPERATOR, text: "ENG-1: renamed", metadata: rootOf("ENG-1") },
              { ts: "1790000002.000100", user: BOT, text: "a reply", thread_ts: "1790000001.000100", metadata: rootOf("ENG-1") },
              // Ours, under the title it had before it was renamed.
              { ts: "1790000001.000100", user: BOT, text: "ENG-1: the old title", metadata: rootOf("ENG-1") },
            ],
            has_more: false,
          };
        default:
          throw new Error(`unexpected ${request.url}`);
      }
    };

    const opened = await slackAt(directory, handler, calls).open("ENG-1", "ENG-1: renamed");

    expect(opened).toEqual({ id: "1790000001.000100" });
    expect(calls.map(methodOf)).not.toContain("chat.postMessage");
    expect(argsOf(calls.find((call) => methodOf(call) === "conversations.history")!)).toMatchObject({
      channel: CHANNEL,
      oldest: "1789999999.000000",
      include_all_metadata: "true",
    });
  });

  it("does not adopt another item's root that shares the title", async () => {
    const calls: HttpRequest[] = [];
    const handler: Handler = (request) => {
      switch (methodOf(request)) {
        case "auth.test":
          return { ok: true, user_id: BOT };
        case "conversations.history":
          return {
            ok: true,
            messages: [{
              ts: "1790000004.000100",
              user: BOT,
              text: "ENG-1",
              metadata: { event_type: "amy_work_thread", event_payload: { work_id: "ENG-9" } },
            }],
            has_more: false,
          };
        default:
          return { ok: true, ts: "1790000009.000100" };
      }
    };

    expect(await slackAt(directory, handler, calls).open("ENG-1", "ENG-1")).toEqual({ id: "1790000009.000100" });
  });

  it("posts the root when Slack never took the first one", async () => {
    const calls: HttpRequest[] = [];
    const handler: Handler = (request) => {
      switch (methodOf(request)) {
        case "auth.test":
          return { ok: true, user_id: BOT };
        case "conversations.history":
          return { ok: true, messages: [], has_more: false };
        default:
          return { ok: true, ts: "1790000009.000100" };
      }
    };

    const opened = await slackAt(directory, handler, calls).open("ENG-1", "ENG-1");

    expect(opened).toEqual({ id: "1790000009.000100" });
    expect(calls.map(methodOf)).toEqual(["auth.test", "conversations.history", "chat.postMessage"]);
  });
});

describe("recovering from a failed call", () => {
  it("asks who the bot is again after auth.test failed once", async () => {
    let authTests = 0;
    const handler: Handler = (request) => {
      if (methodOf(request) === "auth.test") {
        authTests += 1;
        return authTests === 1 ? { ok: false, error: "service_unavailable" } : { ok: true, user_id: BOT };
      }
      return { ok: true, messages: [{ ts: "1790000100.000100", user: OPERATOR, text: "yes" }], has_more: false };
    };
    const slack = slackAt(directory, handler);

    await expect(slack.replies({ id: "1790000000.000100" }, "2026-09-21T00:00:00.000Z")).rejects.toThrow(/service_unavailable/);
    const replies = await slack.replies({ id: "1790000000.000100" }, "2026-09-21T00:00:00.000Z");

    expect(replies.map((reply) => reply.text)).toEqual(["yes"]);
  });

  it("never leaves a half-written file where a whole one is expected", async () => {
    const picture = new Uint8Array([1, 2, 3, 4]);
    const handler: Handler = (request) => {
      if (request.url.startsWith("https://files.slack.com/")) return picture;
      if (methodOf(request) === "auth.test") return { ok: true, user_id: BOT };
      return {
        ok: true,
        messages: [{
          ts: "1790000100.000100",
          user: OPERATOR,
          text: "this",
          files: [{ id: "F0SHOT", name: "shot.png", url_private: "https://files.slack.com/files-pri/T0/F0SHOT/shot.png" }],
        }],
        has_more: false,
      };
    };
    const slack = slackAt(directory, handler);

    // The process dies halfway through writing the bytes, once.
    const write = fs.writeFileSync;
    const spy = vi.spyOn(fs, "writeFileSync").mockImplementationOnce((file, data) => {
      write(file, (data as Uint8Array).slice(0, 2));
      throw new Error("killed mid-write");
    });
    try {
      await expect(slack.replies({ id: "1790000000.000100" }, "2026-09-21T00:00:00.000Z")).rejects.toThrow(/killed mid-write/);
    } finally {
      spy.mockRestore();
    }

    const [reply] = await slack.replies({ id: "1790000000.000100" }, "2026-09-21T00:00:00.000Z");
    expect(new Uint8Array(fs.readFileSync(reply!.files[0]!))).toEqual(picture);
    // Under the thread it came from, so forgetting the thread takes it too.
    expect(fs.readdirSync(path.join(directory, "files", "1790000000.000100", "F0SHOT"))).toEqual(["shot.png"]);
  });

  it("names a picture larger than the limit instead of downloading it, when Slack says how large it is", async () => {
    const calls: HttpRequest[] = [];
    const handler: Handler = (request) => {
      if (methodOf(request) === "auth.test") return { ok: true, user_id: BOT };
      return {
        ok: true,
        messages: [{
          ts: "1790000100.000100",
          user: OPERATOR,
          text: "the recording",
          files: [{ id: "F0BIG", name: "screen.mov", size: 26 * 1024 * 1024, url_private: "https://files.slack.com/files-pri/T0/F0BIG/screen.mov" }],
        }],
        has_more: false,
      };
    };

    const [reply] = await slackAt(directory, handler, calls).replies({ id: "1790000000.000100" }, "2026-09-21T00:00:00.000Z");

    expect(reply!.files).toEqual([]);
    expect(reply!.text).toBe(`the recording\n[screen.mov was not downloaded: it is larger than ${25 * 1024 * 1024} bytes]`);
    expect(calls.some((call) => call.url.startsWith("https://files.slack.com/"))).toBe(false);
  });

  it("stops reading a download that turns out larger than the limit, whatever it declared", async () => {
    const handler: Handler = (request) => {
      if (request.url.startsWith("https://files.slack.com/")) {
        expect(request.maxBytes).toBe(4);
        return new Uint8Array(5);
      }
      if (methodOf(request) === "auth.test") return { ok: true, user_id: BOT };
      return {
        ok: true,
        messages: [{
          ts: "1790000100.000100",
          user: OPERATOR,
          text: "",
          files: [{ id: "F0LIE", name: "small.png", size: 1, url_private: "https://files.slack.com/files-pri/T0/F0LIE/small.png" }],
        }],
        has_more: false,
      };
    };
    const api = new SlackApi("xoxb-test", {
      transport: async (request) => {
        const answer = await handler(request);
        const body = answer instanceof Uint8Array ? answer : new TextEncoder().encode(JSON.stringify(answer));
        return { status: 200, headers: {}, body };
      },
    });
    const slack = new SlackConversation(api, { channel: CHANNEL, operator: OPERATOR, directory, maxFileBytes: 4 });

    const [reply] = await slack.replies({ id: "1790000000.000100" }, "2026-09-21T00:00:00.000Z");

    expect(reply!.files).toEqual([]);
    expect(reply!.text).toBe("[small.png was not downloaded: it is larger than 4 bytes]");
    expect(fs.existsSync(path.join(directory, "files", "1790000000.000100", "F0LIE"))).toBe(false);
  });

  it("names the scope Slack said was missing", async () => {
    const slack = slackAt(directory, () => ({ ok: false, error: "missing_scope", needed: "channels:read" }));

    const checks = await slack.checks();

    expect(checks).toEqual([
      { label: "slack token", ok: false, detail: "slack auth.test refused: missing_scope (needs channels:read)" },
    ]);
  });
});

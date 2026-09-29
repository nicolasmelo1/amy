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

  it("keeps both entries when two of them open different work at once", async () => {
    let roots = 0;
    const handler: Handler = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      roots += 1;
      return { ok: true, ts: `1790000000.00000${roots}` };
    };

    await Promise.all([
      slackAt(directory, handler).open("ENG-1", "ENG-1"),
      slackAt(directory, handler).open("ENG-2", "ENG-2"),
    ]);

    const map = JSON.parse(fs.readFileSync(path.join(directory, "threads.json"), "utf8")) as Record<string, unknown>;
    expect(Object.keys(map).sort()).toEqual(["ENG-1", "ENG-2"]);
  });

  it("takes over a lock left by a process that is gone", async () => {
    fs.writeFileSync(path.join(directory, "threads.lock"), "2147483646");

    const opened = await slackAt(directory, () => ({ ok: true, ts: "1790000000.000001" })).open("ENG-1", "ENG-1");

    expect(opened).toEqual({ id: "1790000000.000001" });
    expect(fs.existsSync(path.join(directory, "threads.lock"))).toBe(false);
  });
});

describe("a crash between Slack taking a root and the map remembering it", () => {
  const pendingSince = 1790000000000;

  beforeEach(() => {
    fs.writeFileSync(path.join(directory, "threads.json"), JSON.stringify({ "ENG-1": { channel: CHANNEL, pendingSince } }));
  });

  it("adopts the root it finds in the channel instead of posting a second", async () => {
    const calls: HttpRequest[] = [];
    const handler: Handler = (request) => {
      switch (methodOf(request)) {
        case "auth.test":
          return { ok: true, user_id: BOT };
        case "conversations.history":
          return {
            ok: true,
            messages: [
              { ts: "1790000003.000100", user: OPERATOR, text: "ENG-1: tom &amp; jerry" },
              { ts: "1790000002.000100", user: BOT, text: "ENG-1: tom &amp; jerry", thread_ts: "1790000001.000100" },
              { ts: "1790000001.000100", user: BOT, text: "ENG-1: tom &amp; jerry" },
            ],
            has_more: false,
          };
        default:
          throw new Error(`unexpected ${request.url}`);
      }
    };

    const opened = await slackAt(directory, handler, calls).open("ENG-1", "ENG-1: tom & jerry");

    expect(opened).toEqual({ id: "1790000001.000100" });
    expect(calls.map(methodOf)).not.toContain("chat.postMessage");
    expect(argsOf(calls.find((call) => methodOf(call) === "conversations.history")!)).toMatchObject({
      channel: CHANNEL,
      oldest: "1789999999.000000",
    });
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
    expect(fs.readdirSync(path.join(directory, "files", "F0SHOT"))).toEqual(["shot.png"]);
  });

  it("names the scope Slack said was missing", async () => {
    const slack = slackAt(directory, () => ({ ok: false, error: "missing_scope", needed: "channels:read" }));

    const checks = await slack.checks();

    expect(checks).toEqual([
      { label: "slack token", ok: false, detail: "slack auth.test refused: missing_scope (needs channels:read)" },
    ]);
  });
});

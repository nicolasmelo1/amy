import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HttpRequest, HttpResponse, SlackApi, SlackConversation } from "../src/index.js";

/**
 * The adapter against a scripted HTTP transport, the way the tracker and the
 * forge are proved against recorded answers. Every answer below is shaped
 * from Slack's documented responses: `ok`, the method's own fields, and the
 * `x-oauth-scopes` header every Web API response carries.
 */
const CHANNEL = "C0WORK";
const OPERATOR = "U0ADA";
const BOT = "U0AMYBOT";
const THREAD = "1790000000.000100";

type Answer = { status?: number; headers?: Record<string, string>; json?: unknown; bytes?: Uint8Array };
type Script = { match: (request: HttpRequest) => boolean; answer: Answer };

class ScriptedHttp {
  readonly calls: HttpRequest[] = [];
  constructor(private readonly script: Script[]) {}

  readonly transport = (request: HttpRequest): Promise<HttpResponse> => {
    this.calls.push(request);
    const index = this.script.findIndex((entry) => entry.match(request));
    if (index === -1) throw new Error(`nothing scripted for ${request.method} ${request.url} ${request.body ?? ""}`);
    const [entry] = this.script.splice(index, 1);
    const answer = entry!.answer;
    const body = answer.bytes ?? new TextEncoder().encode(JSON.stringify(answer.json ?? {}));
    return Promise.resolve({ status: answer.status ?? 200, headers: answer.headers ?? {}, body });
  };

  /** The Web API calls to one method, their form arguments decoded. */
  argsOf(method: string): Record<string, string>[] {
    return this.calls
      .filter((call) => call.url.endsWith(`/api/${method}`))
      .map((call) => Object.fromEntries(new URLSearchParams(call.body ?? "")));
  }
}

function method(name: string): (request: HttpRequest) => boolean {
  return (request) => request.url === `https://slack.com/api/${name}`;
}

function ok(json: Record<string, unknown>, headers: Record<string, string> = {}): Answer {
  return { json: { ok: true, ...json }, headers };
}

const WHO_AM_I: Script = { match: method("auth.test"), answer: ok({ user_id: BOT, user: "amy", team: "Workshop" }) };

function thread(messages: unknown[]): Script {
  return { match: method("conversations.replies"), answer: ok({ messages, has_more: false }) };
}

let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-slack-"));
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

function conversation(http: ScriptedHttp, sleeps: number[] = []): SlackConversation {
  const api = new SlackApi("xoxb-test", {
    transport: http.transport,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  });
  return new SlackConversation(api, { channel: CHANNEL, operator: OPERATOR, directory });
}

describe("a Slack thread per piece of work", () => {
  it("opens a thread with the first post and lands every later post in it, across a restart", async () => {
    const http = new ScriptedHttp([
      { match: method("chat.postMessage"), answer: ok({ ts: THREAD }) },
      { match: method("chat.postMessage"), answer: ok({ ts: "1790000001.000200" }) },
      { match: method("chat.postMessage"), answer: ok({ ts: "1790000002.000300" }) },
    ]);

    const first = conversation(http);
    const opened = await first.open("ENG-1", "ENG-1: the login page");
    await first.post(opened, { text: "- which browser?" });

    // A new process: nothing in memory, only the directory.
    const restarted = conversation(http);
    const reopened = await restarted.open("ENG-1", "ENG-1: the login page");
    await restarted.post(reopened, { text: "- and which version?" });

    expect(reopened).toEqual({ id: THREAD });
    const posts = http.argsOf("chat.postMessage");
    expect(posts).toHaveLength(3);
    expect(posts[0]).toMatchObject({ channel: CHANNEL, text: "ENG-1: the login page" });
    // The root carries its work id, which is what recovery after a crash reads.
    expect(JSON.parse(posts[0]!.metadata!)).toEqual({ event_type: "amy_work_thread", event_payload: { work_id: "ENG-1" } });
    expect(posts[1]).toMatchObject({ channel: CHANNEL, thread_ts: THREAD, text: "- which browser?" });
    expect(posts[2]).toMatchObject({ channel: CHANNEL, thread_ts: THREAD, text: "- and which version?" });
  });

  it("opens one thread when the same work is opened twice at once", async () => {
    const http = new ScriptedHttp([{ match: method("chat.postMessage"), answer: ok({ ts: THREAD }) }]);
    const slack = conversation(http);

    const [a, b] = await Promise.all([slack.open("ENG-2", "ENG-2"), slack.open("ENG-2", "ENG-2")]);

    expect(a).toEqual(b);
    expect(http.argsOf("chat.postMessage")).toHaveLength(1);
  });

  it("gives each piece of work its own thread", async () => {
    const http = new ScriptedHttp([
      { match: method("chat.postMessage"), answer: ok({ ts: THREAD }) },
      { match: method("chat.postMessage"), answer: ok({ ts: "1790000009.000900" }) },
    ]);
    const slack = conversation(http);

    expect(await slack.open("ENG-1", "ENG-1")).toEqual({ id: THREAD });
    expect(await slack.open("ENG-2", "ENG-2")).toEqual({ id: "1790000009.000900" });
  });

  it("refuses to upload a file, since it never asked for the scope to", async () => {
    const slack = conversation(new ScriptedHttp([]));

    await expect(slack.post({ id: THREAD }, { text: "see", files: ["/tmp/x.png"] })).rejects.toThrow(/does not upload/);
  });
});

describe("the operator's replies", () => {
  it("returns a reply with an image as text and a readable local path", async () => {
    const picture = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const http = new ScriptedHttp([
      WHO_AM_I,
      thread([
        { ts: THREAD, user: BOT, bot_id: "B0AMY", text: "ENG-1" },
        {
          ts: "1790000100.000100",
          user: OPERATOR,
          subtype: "file_share",
          text: "this one",
          files: [{ id: "F0SHOT", name: "screen shot.png", url_private_download: "https://files.slack.com/files-pri/T0/F0SHOT/download" }],
        },
      ]),
      { match: (request) => request.url.startsWith("https://files.slack.com/"), answer: { bytes: picture } },
    ]);

    const replies = await conversation(http).replies({ id: THREAD }, "2026-09-21T00:00:00.000Z");

    expect(replies).toHaveLength(1);
    // 1790000100.000100 rounds up to the next millisecond, so passing it back
    // as `since` never returns this reply again.
    expect(replies[0]).toMatchObject({ author: OPERATOR, text: "this one", at: new Date(1790000100001).toISOString() });
    const [file] = replies[0]!.files;
    expect(file!.startsWith(directory)).toBe(true);
    expect(new Uint8Array(fs.readFileSync(file!))).toEqual(picture);
    // The file is fetched with the bot token, which is what `files:read` is for.
    expect(http.calls.at(-1)!.headers.Authorization).toBe("Bearer xoxb-test");
  });

  it("never returns a reply from anybody but the operator, nor the bot's own", async () => {
    const http = new ScriptedHttp([
      WHO_AM_I,
      thread([
        { ts: THREAD, user: BOT, text: "ENG-1" },
        { ts: "1790000100.000100", user: "U0GRACE", text: "I think it is Safari" },
        { ts: "1790000101.000100", user: BOT, text: "- which browser?" },
        { ts: "1790000102.000100", bot_id: "B0OTHER", user: OPERATOR, text: "posted by an integration as the operator" },
        { ts: "1790000103.000100", user: OPERATOR, subtype: "channel_join", text: "joined" },
        { ts: "1790000104.000100", user: OPERATOR, text: "Firefox 130" },
      ]),
    ]);

    const replies = await conversation(http).replies({ id: THREAD }, "2026-09-21T00:00:00.000Z");

    expect(replies.map((reply) => reply.text)).toEqual(["Firefox 130"]);
  });

  it("does not trust a marker in the text: an operator reply that looks like the bot's still counts", async () => {
    const http = new ScriptedHttp([
      WHO_AM_I,
      thread([{ ts: "1790000104.000100", user: OPERATOR, text: "- which browser? (amy)" }]),
    ]);

    const replies = await conversation(http).replies({ id: THREAD }, "2026-09-21T00:00:00.000Z");

    expect(replies).toHaveLength(1);
  });

  it("returns only what came after the instant asked for, oldest first, across pages", async () => {
    const http = new ScriptedHttp([
      WHO_AM_I,
      {
        match: (request) => method("conversations.replies")(request) && !request.body?.includes("cursor="),
        answer: ok({
          messages: [
            { ts: "1790000200.000100", user: OPERATOR, text: "second" },
            { ts: "1790000050.000100", user: OPERATOR, text: "before" },
          ],
          has_more: true,
          response_metadata: { next_cursor: "page2" },
        }),
      },
      {
        match: (request) => method("conversations.replies")(request) && Boolean(request.body?.includes("cursor=page2")),
        answer: ok({ messages: [{ ts: "1790000150.000100", user: OPERATOR, text: "first" }], has_more: false }),
      },
    ]);

    const since = new Date(1790000100000).toISOString();
    const replies = await conversation(http).replies({ id: THREAD }, since);

    expect(replies.map((reply) => reply.text)).toEqual(["first", "second"]);
    expect(http.argsOf("conversations.replies")[0]).toMatchObject({ channel: CHANNEL, ts: THREAD, oldest: "1790000100.000000" });
  });

  it("keeps a reply a fraction of a millisecond after the instant asked for, and does not repeat it when its own instant is asked", async () => {
    const script = () => [
      WHO_AM_I,
      thread([{ ts: "1790000100.000100", user: OPERATOR, text: "just after" }]),
    ];

    const first = await conversation(new ScriptedHttp(script())).replies({ id: THREAD }, new Date(1790000100000).toISOString());
    const again = await conversation(new ScriptedHttp(script())).replies({ id: THREAD }, first[0]!.at);

    expect(first.map((reply) => reply.text)).toEqual(["just after"]);
    expect(again).toEqual([]);
  });

  it("never sends the token to a file URL that is not Slack's", async () => {
    const http = new ScriptedHttp([
      WHO_AM_I,
      thread([
        {
          ts: "1790000100.000100",
          user: OPERATOR,
          text: "look",
          files: [{ id: "F0BAD", name: "x.png", url_private: "https://elsewhere.example.test/x.png" }],
        },
      ]),
    ]);

    await expect(conversation(http).replies({ id: THREAD }, "2026-09-21T00:00:00.000Z")).rejects.toThrow(/refusing to send the slack token/);
    expect(http.calls.some((call) => call.url.includes("elsewhere"))).toBe(false);
  });
});

describe("rate limits", () => {
  it("waits the Retry-After it was given before trying again", async () => {
    const sleeps: number[] = [];
    const http = new ScriptedHttp([
      { match: method("chat.postMessage"), answer: { status: 429, headers: { "retry-after": "30" } } },
      { match: method("chat.postMessage"), answer: ok({ ts: "1790000001.000200" }) },
    ]);

    const ts = await conversation(http, sleeps).post({ id: THREAD }, { text: "hello" });

    expect(ts).toBe("1790000001.000200");
    expect(sleeps).toEqual([30_000]);
    expect(http.argsOf("chat.postMessage")).toHaveLength(2);
  });

  it("waits a minute when told to wait without being told how long", async () => {
    const sleeps: number[] = [];
    const http = new ScriptedHttp([
      { match: method("chat.postMessage"), answer: { status: 429 } },
      { match: method("chat.postMessage"), answer: ok({ ts: "1790000001.000200" }) },
    ]);

    await conversation(http, sleeps).post({ id: THREAD }, { text: "hello" });

    expect(sleeps).toEqual([60_000]);
  });

  it("gives up, saying so, when the limit never lifts", async () => {
    const limited: Script = { match: method("chat.postMessage"), answer: { status: 429, headers: { "retry-after": "1" } } };
    const http = new ScriptedHttp(Array.from({ length: 6 }, () => limited));

    await expect(conversation(http).post({ id: THREAD }, { text: "hello" })).rejects.toThrow(/kept rate limiting/);
  });

  it("fails naming the method when Slack refuses a call", async () => {
    const http = new ScriptedHttp([{ match: method("chat.postMessage"), answer: { json: { ok: false, error: "not_in_channel" } } }]);

    await expect(conversation(http).post({ id: THREAD }, { text: "hello" })).rejects.toThrow("slack chat.postMessage refused: not_in_channel");
  });
});

describe("what amy doctor asks", () => {
  const SCOPES = { "x-oauth-scopes": "chat:write,groups:read,groups:history,files:read" };

  it("reports the token, the channel and the scopes a private channel needs", async () => {
    const http = new ScriptedHttp([
      { match: method("auth.test"), answer: ok({ user_id: BOT, user: "amy", team: "Workshop" }, SCOPES) },
      { match: method("conversations.info"), answer: ok({ channel: { id: CHANNEL, name: "amy-work", is_private: true } }) },
    ]);

    const checks = await conversation(http).checks();

    expect(checks).toEqual([
      { label: "slack token", ok: true, detail: "amy in Workshop" },
      { label: `slack channel ${CHANNEL}`, ok: true, detail: "#amy-work" },
      { label: "slack scopes", ok: true, detail: "chat:write, groups:read, groups:history, files:read" },
    ]);
  });

  it("names the read and history scopes a public channel needs when the token lacks them", async () => {
    const http = new ScriptedHttp([
      { match: method("auth.test"), answer: ok({ user_id: BOT, user: "amy", team: "Workshop" }, SCOPES) },
      { match: method("conversations.info"), answer: ok({ channel: { id: CHANNEL, name: "amy-work", is_private: false } }) },
    ]);

    const checks = await conversation(http).checks();

    expect(checks.at(-1)).toEqual({ label: "slack scopes", ok: false, detail: "missing channels:read, channels:history" });
  });

  it("fails the channel, naming the fix, when the bot can read it but is not in it", async () => {
    const http = new ScriptedHttp([
      { match: method("auth.test"), answer: ok({ user_id: BOT, user: "amy", team: "Workshop" }, { "x-oauth-scopes": "chat:write,channels:read,channels:history,files:read" }) },
      { match: method("conversations.info"), answer: ok({ channel: { id: CHANNEL, name: "amy-work", is_private: false, is_member: false } }) },
    ]);

    const checks = await conversation(http).checks();

    expect(checks).toContainEqual({ label: `slack channel ${CHANNEL}`, ok: false, detail: "the bot is not in #amy-work; invite it there with /invite" });
    // The scopes are their own question, and still answered.
    expect(checks).toContainEqual({ label: "slack scopes", ok: true, detail: "chat:write, channels:read, channels:history, files:read" });
  });

  it("says the channel cannot be seen when Slack says so", async () => {
    const http = new ScriptedHttp([
      { match: method("auth.test"), answer: ok({ user_id: BOT, user: "amy", team: "Workshop" }, SCOPES) },
      { match: method("conversations.info"), answer: { json: { ok: false, error: "channel_not_found" } } },
    ]);

    const checks = await conversation(http).checks();

    expect(checks.at(-1)).toEqual({
      label: `slack channel ${CHANNEL}`,
      ok: false,
      detail: "slack conversations.info refused: channel_not_found",
    });
  });

  it("says the token is refused and asks nothing else", async () => {
    const http = new ScriptedHttp([{ match: method("auth.test"), answer: { json: { ok: false, error: "invalid_auth" } } }]);

    expect(await conversation(http).checks()).toEqual([
      { label: "slack token", ok: false, detail: "slack auth.test refused: invalid_auth" },
    ]);
    expect(http.calls).toHaveLength(1);
  });
});

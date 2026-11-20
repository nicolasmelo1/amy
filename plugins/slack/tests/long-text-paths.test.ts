import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HttpRequest, HttpResponse, SlackApi, SlackConversation } from "../src/index.js";

const LIMIT = 4000;
const THREAD = "1790000000.000100";
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

interface Call {
  readonly method: string;
  readonly params: Record<string, string>;
}

/** A Slack that answers every call, recording it, with the warning given. */
function slack(warning?: string): { calls: Call[]; warned: string[]; conversation: SlackConversation } {
  const calls: Call[] = [];
  const warned: string[] = [];
  let clock = 0;
  const transport = (request: HttpRequest): Promise<HttpResponse> => {
    const method = request.url.split("/").pop() ?? "";
    calls.push({ method, params: Object.fromEntries(new URLSearchParams(request.body ?? "")) });
    clock += 1;
    const json = JSON.stringify({
      ok: true,
      ts: `17900001${String(clock).padStart(2, "0")}.000100`,
      channel: "C0WORK",
      messages: [],
      ...(warning === undefined ? {} : { warning }),
    });
    return Promise.resolve({ status: 200, headers: {}, body: new TextEncoder().encode(json) });
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-slack-paths-"));
  directories.push(directory);
  const conversation = new SlackConversation(new SlackApi("xoxb-fixture", { transport }), {
    channel: "C0WORK",
    operator: "U0ADA",
    directory,
    warn: (line) => warned.push(line),
  });
  return { calls, warned, conversation };
}

/**
 * A Slack that keeps one thread's messages the way a reader sees them:
 * posted, updated in place, or deleted, in the order they were posted.
 */
function slackThread(): { conversation: SlackConversation; visible: () => string[] } {
  const messages = new Map<string, string>();
  let clock = 0;
  const transport = (request: HttpRequest): Promise<HttpResponse> => {
    const method = request.url.split("/").pop() ?? "";
    const params = Object.fromEntries(new URLSearchParams(request.body ?? ""));
    let ts = params.ts ?? "";
    if (method === "chat.postMessage") {
      clock += 1;
      ts = `17900002${String(clock).padStart(2, "0")}.000100`;
      messages.set(ts, params.text ?? "");
    } else if (method === "chat.update") {
      messages.set(ts, params.text ?? "");
    } else if (method === "chat.delete") {
      messages.delete(ts);
    }
    const json = JSON.stringify({ ok: true, ts, channel: "C0WORK", messages: [] });
    return Promise.resolve({ status: 200, headers: {}, body: new TextEncoder().encode(json) });
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-slack-thread-"));
  directories.push(directory);
  const conversation = new SlackConversation(new SlackApi("xoxb-fixture", { transport }), {
    channel: "C0WORK",
    operator: "U0ADA",
    directory,
    warn: () => undefined,
  });
  const visible = () => [...messages.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, text]) => text);
  return { conversation, visible };
}

describe("Slack's long text, on every path that sends it", () => {
  it("names the thread when Slack says it truncated a post", async () => {
    const { warned, conversation } = slack("message_truncated");
    await conversation.say(THREAD, "a".repeat(10));

    expect(warned.some((line) => line.includes(THREAD))).toBe(true);
  });

  it("reads a truncation that Slack reports among other warnings", async () => {
    const { warned, conversation } = slack("superfluous_charset,message_truncated");
    await conversation.say(THREAD, "a".repeat(10));

    expect(warned.some((line) => line.includes("message_truncated"))).toBe(true);
  });

  it("keeps every piece of a long thread title inside the one thread it opens", async () => {
    const { calls, conversation } = slack();
    const thread = await conversation.open("PROJ-1", "t".repeat(9_001));

    const posts = calls.filter((call) => call.method === "chat.postMessage");
    const roots = posts.filter((call) => call.params.thread_ts === undefined);
    expect(roots).toHaveLength(1);
    for (const post of posts.slice(1)) expect(post.params.thread_ts).toBe(thread.id);
    expect(posts.map((post) => post.params.text).join("")).toBe("t".repeat(9_001));
  });

  it.each([
    ["a long message revised short", 9_001, 10],
    ["a long message revised long", 9_001, 8_500],
    ["a short message revised long", 10, 9_001],
  ])("leaves the thread reading as the revision, for %s", async (_name, before, after) => {
    const { conversation, visible } = slackThread();
    const ts = await conversation.say(THREAD, "o".repeat(before));
    await conversation.revise(THREAD, ts, "n".repeat(after));

    expect(visible().join("")).toBe("n".repeat(after));
    for (const text of visible()) expect(text.length).toBeLessThanOrEqual(LIMIT);
  });

  it("keeps a revised message within Slack's limit, and the revision whole", async () => {
    const { calls, conversation } = slack();
    const said = "r".repeat(9_001);
    await conversation.revise(THREAD, "1790000000.000200", said);

    const sent = calls.filter((call) => call.method === "chat.update" || call.method === "chat.postMessage");
    for (const call of sent) expect((call.params.text ?? "").length).toBeLessThanOrEqual(LIMIT);
    expect(sent.map((call) => call.params.text).join("")).toBe(said);
  });
});

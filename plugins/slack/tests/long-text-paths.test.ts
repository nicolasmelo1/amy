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

  it("keeps a revised message within Slack's limit, and the revision whole", async () => {
    const { calls, conversation } = slack();
    const said = "r".repeat(9_001);
    await conversation.revise(THREAD, "1790000000.000200", said);

    const sent = calls.filter((call) => call.method === "chat.update" || call.method === "chat.postMessage");
    for (const call of sent) expect((call.params.text ?? "").length).toBeLessThanOrEqual(LIMIT);
    expect(sent.map((call) => call.params.text).join("")).toBe(said);
  });
});

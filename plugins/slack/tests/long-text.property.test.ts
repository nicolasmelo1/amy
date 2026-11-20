import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { HttpRequest, HttpResponse, SlackApi, SlackConversation } from "../src/index.js";

const FALSIFIER = "one_post_for_any_length";
const planted = process.env.SF_FALSIFIER === FALSIFIER;

/** Slack's own reading of a post: 4,000 characters asked, 40,000 truncated. */
const LIMIT = 4000;
const THREAD = "1790000000.000100";
const LETTERS = ["a", "b", "c", "0", " ", "\n", "😀", "é"];

/** A text of a length of interest: short, just past one post, and long. */
const letters = (minLength: number, maxLength: number) =>
  fc.array(fc.constantFrom(...LETTERS), { minLength, maxLength }).map((one) => one.join(""));
const text = fc.oneof(letters(0, 50), letters(4000, 4300), letters(8000, 8100));

interface Posted {
  readonly text: string;
}

/** A Slack that answers every post, recording the text it was sent. */
function slack(posted: Posted[], warn: string[]): { api: SlackApi; conversation: SlackConversation } {
  let clock = 0;
  const transport = (_request: HttpRequest): Promise<HttpResponse> => {
    const body = Object.fromEntries(new URLSearchParams(_request.body ?? ""));
    posted.push({ text: body.text ?? "" });
    clock += 1;
    const json = JSON.stringify({ ok: true, ts: `17900000${String(clock).padStart(2, "0")}.000100` });
    return Promise.resolve({ status: 200, headers: {}, body: new TextEncoder().encode(json) });
  };
  const api = new SlackApi("xoxb-fixture", { transport });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-slack-long-"));
  const conversation = new SlackConversation(api, {
    channel: "C0WORK",
    operator: "U0ADA",
    directory,
    warn: (line) => warn.push(line),
  });
  return { api, conversation };
}

/** The mutation the property must reject: the whole text in one post. */
async function onePost(api: SlackApi, said: string): Promise<string> {
  const { body } = await api.call("chat.postMessage", { channel: "C0WORK", thread_ts: THREAD, text: said });
  return String(body.ts);
}

describe("a Slack post longer than one message", () => {
  it(FALSIFIER, async () => {
    await fc.assert(
      fc.asyncProperty(text, async (said) => {
        const posted: Posted[] = [];
        const warned: string[] = [];
        const { api, conversation } = slack(posted, warned);
        if (planted) await onePost(api, said);
        else await conversation.say(THREAD, said);

        expect(posted.length).toBeGreaterThan(0);
        for (const post of posted) expect(post.text.length).toBeLessThanOrEqual(LIMIT);
        expect(posted.map((post) => post.text).join("")).toBe(said);
      }),
      { numRuns: 25 },
    );
  }, 60_000);
});

import { assertValidSlackAnswer, assertValidSlackCall } from "@amykit/test-fixtures";
import type { HttpRequest, HttpResponse, HttpTransport } from "../src/index.js";

/**
 * A stand-in Slack, held to the description Slack serves: every Web API call
 * through it is checked for its method and arguments, and every answer it
 * scripts for its shape. A file download is not a Web API call and passes.
 */
export function heldToTheContract(transport: HttpTransport): HttpTransport {
  return async (request: HttpRequest): Promise<HttpResponse> => {
    const method = /^https:\/\/slack\.com\/api\/([\w.]+)$/.exec(request.url)?.[1];
    if (!method) return transport(request);
    assertValidSlackCall(method, Object.fromEntries(new URLSearchParams(request.body ?? "")));
    const response = await transport(request);
    if (response.status === 200) {
      assertValidSlackAnswer(method, JSON.parse(new TextDecoder().decode(response.body)) as Record<string, unknown>);
    }
    return response;
  };
}

/** What `auth.test` answers, whole: Slack's description requires every field here. */
export function whoAmI(userId: string): Record<string, unknown> {
  return { url: "https://workshop.slack.com/", team: "Workshop", user: "amy", team_id: "T0WORK", user_id: userId };
}

/** What `chat.postMessage` answers, whole: the channel and the message along with its ts. */
export function postedAnswer(ts: string): Record<string, unknown> {
  return { channel: "C0WORK", ts, message: { type: "message", text: "", ts } };
}

/** What `conversations.history` always answers beside its messages, by Slack's description. */
export const HISTORY_FIELDS = { pin_count: 0, channel_actions_ts: null, channel_actions_count: 0 } as const;

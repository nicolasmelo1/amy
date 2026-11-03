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

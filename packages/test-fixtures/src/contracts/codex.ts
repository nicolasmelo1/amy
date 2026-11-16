import { ContractViolation } from "./violation.js";

/**
 * The requests amy sends to `codex app-server`, held to the protocol codex-cli
 * 0.166.0 generates (`codex app-server generate-json-schema --out DIR`, vendored
 * as contracts/codex-app-server.json.gz).
 *
 * Only the client requests amy sends are checked, against the shape that
 * release's own `ClientRequest.json` and `UserInput.json` define: a skill is a
 * `{ type: "skill", name, path }` input, not a `/name` string in the text.
 */
const CONTRACT = "codex app-server";

type Shape = (params: Record<string, unknown>) => void;
type Json = Record<string, unknown>;

function object(params: unknown): Json {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new ContractViolation(CONTRACT, "a request's params are an object");
  }
  return params as Json;
}

function string(value: unknown, what: string): void {
  if (typeof value !== "string") throw new ContractViolation(CONTRACT, `${what} is a string`);
}

function optionalString(value: unknown, what: string): void {
  if (value !== undefined && value !== null) string(value, what);
}

const SANDBOXES = new Set(["read-only", "workspace-write", "danger-full-access"]);

/** `UserInput` in codex_app_server_protocol.v2.schemas.json. */
function input(items: unknown): void {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ContractViolation(CONTRACT, "turn/start input is a non-empty array");
  }
  for (const item of items) {
    const one = object(item);
    switch (one.type) {
      case "text":
        string(one.text, "a text input's text");
        return;
      case "skill":
        string(one.name, "a skill input's name");
        string(one.path, "a skill input's path");
        return;
      case "image":
      case "localImage":
      case "audio":
      case "localAudio":
        return;
      default:
        throw new ContractViolation(
          CONTRACT,
          `UserInput has no type ${JSON.stringify(one.type)} (it has text, image, localImage, audio, localAudio and skill)`,
        );
    }
  }
}

const REQUESTS: Record<string, Shape> = {
  initialize: (params) => {
    if (!params.clientInfo || typeof params.clientInfo !== "object") {
      throw new ContractViolation(CONTRACT, "initialize names a clientInfo object");
    }
  },
  "thread/start": (params) => {
    optionalString(params.cwd, "thread/start cwd");
    optionalString(params.model, "thread/start model");
    if (params.sandbox !== undefined && params.sandbox !== null && !SANDBOXES.has(String(params.sandbox))) {
      throw new ContractViolation(CONTRACT, `thread/start sandbox is one of ${[...SANDBOXES].join(", ")}`);
    }
    if (params.ephemeral !== undefined && params.ephemeral !== null && typeof params.ephemeral !== "boolean") {
      throw new ContractViolation(CONTRACT, "thread/start ephemeral is a boolean");
    }
    if (params.approvalPolicy !== undefined && params.approvalPolicy !== null) {
      string(params.approvalPolicy, "thread/start approvalPolicy");
    }
    if (params.config !== undefined && params.config !== null && typeof params.config !== "object") {
      throw new ContractViolation(CONTRACT, "thread/start config is an object");
    }
  },
  "turn/start": (params) => {
    string(params.threadId, "turn/start threadId");
    input(params.input);
  },
  "account/rateLimits/read": () => undefined,
};

export function assertValidCodexRequest(method: string, params: unknown): void {
  const shape = REQUESTS[method];
  if (!shape) {
    throw new ContractViolation(CONTRACT, `no client request ${JSON.stringify(method)} (it has ${Object.keys(REQUESTS).join(", ")})`);
  }
  shape(object(params));
}

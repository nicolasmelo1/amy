import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { ContractViolation, contractFile } from "./violation.js";

const CONTRACT = "slack-web";

interface Schema {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  /** Read as alternatives when it is a list: how the description writes "one of these answers". */
  items?: Schema | Schema[];
}

interface Parameter {
  name: string;
  in: string;
  type?: string;
  required?: boolean;
}

interface Operation {
  parameters?: Parameter[];
  responses?: Record<string, { schema?: Schema }>;
}

interface Description {
  paths: Record<string, Record<string, Operation>>;
  definitions: Record<string, Schema>;
}

/**
 * What Slack documents and its served description does not carry yet. The
 * description Slack serves is the Web API's as of its own version, and
 * message metadata arrived after it; each line here names where Slack says
 * so, and is the only way past the description.
 */
const BEYOND_THE_DESCRIPTION: Record<string, { parameters?: string[]; answer?: string[]; source: string }> = {
  "chat.postMessage": { parameters: ["metadata"], source: "https://docs.slack.dev/reference/methods/chat.postMessage" },
  "conversations.history": {
    parameters: ["include_all_metadata"],
    answer: ["response_metadata"],
    source: "https://docs.slack.dev/reference/methods/conversations.history",
  },
  // Cursor pagination, which the description predates.
  "conversations.replies": { answer: ["response_metadata"], source: "https://docs.slack.dev/reference/methods/conversations.replies" },
};

let description: Description | undefined;

function openapi(): Description {
  description ??= JSON.parse(gunzipSync(readFileSync(contractFile("slack-web.json.gz"))).toString("utf8")) as Description;
  return description;
}

function operation(method: string): Operation {
  const path = openapi().paths[`/${method}`];
  const found = path ? Object.values(path)[0] : undefined;
  if (!found) throw new ContractViolation(CONTRACT, `the Web API has no method ${method}`);
  return found;
}

/**
 * Refuses a call Slack would not take: a method it does not have, an
 * argument the method does not name, or a required one left out. Arguments
 * arrive form-encoded, so a number or a boolean is held to its spelling.
 */
export function assertValidSlackCall(method: string, args: Record<string, string>): void {
  const declared = (operation(method).parameters ?? []).filter((parameter) => parameter.in !== "header");
  const beyond = BEYOND_THE_DESCRIPTION[method]?.parameters ?? [];
  for (const [name, value] of Object.entries(args)) {
    if (beyond.includes(name)) continue;
    const parameter = declared.find((candidate) => candidate.name === name);
    if (!parameter) throw new ContractViolation(CONTRACT, `${method} takes no argument ${name}`);
    if (!spelled(parameter.type, value)) throw new ContractViolation(CONTRACT, `${method}.${name} is ${parameter.type}, and was sent ${JSON.stringify(value)}`);
  }
  for (const parameter of declared) {
    if (parameter.required && parameter.name !== "token" && args[parameter.name] === undefined) {
      throw new ContractViolation(CONTRACT, `${method} requires ${parameter.name}, and it was not sent`);
    }
  }
}

/**
 * Refuses a successful answer Slack could never send: a top-level property
 * the method's answer does not declare, one of another type, or a required
 * one missing. A refusal (`ok: false`) is held only to carrying its error.
 */
export function assertValidSlackAnswer(method: string, body: Record<string, unknown>): void {
  if (body.ok === false) {
    if (typeof body.error !== "string") throw new ContractViolation(CONTRACT, `${method} refused without naming an error`);
    return;
  }
  const schema = resolve(operation(method).responses?.["200"]?.schema ?? {});
  const alternatives = Array.isArray(schema.items) && !schema.properties ? schema.items.map(resolve) : [schema];
  const failures = alternatives.map((alternative) => mismatch(method, alternative, body));
  if (failures.every(Boolean)) throw new ContractViolation(CONTRACT, failures[0]!);
}

function mismatch(method: string, schema: Schema, body: Record<string, unknown>): string | null {
  const beyond = BEYOND_THE_DESCRIPTION[method]?.answer ?? [];
  for (const [name, value] of Object.entries(body)) {
    const property = schema.properties?.[name];
    if (!property) {
      if (beyond.includes(name)) continue;
      return `${method} answers no property ${name}`;
    }
    const types = typesOf(resolve(property));
    if (types.length > 0 && !types.some((type) => fits(type, value))) {
      return `${method}.${name} is ${types.join(" or ")}, and holds ${JSON.stringify(value)}`;
    }
  }
  return null;
}

function resolve(schema: Schema): Schema {
  let current = schema;
  while (current.$ref) {
    const name = current.$ref.replace("#/definitions/", "");
    const next = openapi().definitions[name];
    if (!next) throw new ContractViolation(CONTRACT, `the description names ${current.$ref} and does not define it`);
    current = next;
  }
  return current;
}

function typesOf(schema: Schema): string[] {
  return schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
}

function fits(type: string, value: unknown): boolean {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "null") return value === null;
  return typeof value === type;
}

function spelled(type: string | undefined, value: string): boolean {
  if (type === "boolean") return value === "true" || value === "false" || value === "1" || value === "0";
  if (type === "integer") return /^-?\d+$/.test(value);
  if (type === "number") return value.trim() !== "" && Number.isFinite(Number(value));
  return true;
}

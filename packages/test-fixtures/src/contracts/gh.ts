import { readFileSync } from "node:fs";
import type { DocumentNode } from "graphql";
import { assertValidRequest, assertValidResponse } from "./graphql.js";
import { assertValidAnswer, assertValidParameters, operationFor } from "./openapi.js";
import { ContractViolation, contractFile } from "./violation.js";

const CONTRACT = "gh";

interface Flag {
  long: string;
  short?: string;
  takesValue: boolean;
}

interface Command {
  path: string;
  flags: Flag[];
}

let commands: Map<string, Command> | undefined;
let prJsonFields: Set<string> | undefined;

/**
 * Every command and flag the pinned `gh` release prints in `gh reference`.
 * A flag on `gh pr` is a flag of every `gh pr …`, which is how the
 * reference lays out inherited flags such as `--repo`.
 */
function reference(): Map<string, Command> {
  if (commands) return commands;
  commands = new Map();

  let current: Command | undefined;
  for (const line of readFileSync(contractFile("gh-reference.md"), "utf8").split("\n")) {
    if (line.startsWith("#") && line.includes(" gh ")) {
      const words = line.slice(line.indexOf(" gh ") + 4).split(" ");
      const path = words.filter((_, index) => words.slice(0, index + 1).every(isCommandWord)).join(" ");
      current = { path, flags: [] };
      commands.set(path, current);
      continue;
    }
    const flag = parseFlag(line);
    if (flag && current) current.flags.push(flag);
  }
  return commands;
}

function isCommandWord(word: string): boolean {
  return word.length > 0 && /^[a-z][a-z0-9-]*$/.test(word);
}

/** `  -F, --field key=value   Add a typed…` or `      --paginate   Make…`. */
function parseFlag(line: string): Flag | null {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith("-") || line.length === trimmed.length) return null;

  let rest = trimmed;
  let short: string | undefined;
  if (!rest.startsWith("--")) {
    short = rest.slice(1, 2);
    rest = rest.slice(4);
  }
  if (!rest.startsWith("--")) return null;

  const gap = rest.indexOf("  ");
  const spec = (gap === -1 ? rest : rest.slice(0, gap)).trim().split(" ");
  return { long: spec[0]!.slice(2), ...(short ? { short } : {}), takesValue: spec.length > 1 };
}

function pullRequestJsonFields(): Set<string> {
  prJsonFields ??= new Set(readFileSync(contractFile("gh-pr-json-fields.txt"), "utf8").split("\n").filter(Boolean));
  return prJsonFields;
}

/** What one `gh` invocation asks for, once the pinned release has parsed it. */
export interface GhRequest {
  command: string;
  positionals: string[];
  flags: Map<string, string[]>;
  api?: { method: string; endpoint: string; params: Record<string, unknown>; document?: DocumentNode; jq: boolean };
}

/**
 * Refuses an invocation the pinned `gh` would refuse: a command it does not
 * have, a flag that command does not take, and — for `gh api` — the fields
 * parsed by gh's own rules (`pkg/cmd/api/fields.go`), so a field claimed
 * twice is refused the way gh refuses it. What survives is then held to the
 * API it reaches: GraphQL to GitHub's schema, REST to its OpenAPI
 * description.
 */
export function assertValidGhInvocation(args: readonly string[]): GhRequest {
  const command = commandOf(args);
  const flags = flagsOf(command);
  const request: GhRequest = { command, positionals: [], flags: new Map() };

  for (let index = command.split(" ").length; index < args.length; index += 1) {
    const arg = args[index]!;
    if (!arg.startsWith("-") || arg === "-") {
      request.positionals.push(arg);
      continue;
    }
    const read = readFlag(command, flags, args, index);
    index = read.next;
    request.flags.set(read.flag, [...(request.flags.get(read.flag) ?? []), read.value]);
  }

  if (command === "api") {
    request.api = apiRequest(request, request.flags.get("raw-field") ?? [], request.flags.get("field") ?? []);
  }
  if (request.flags.has("json")) assertJsonFields(command, request.flags.get("json")!.at(-1)!);
  return request;
}

/** The longest run of leading words that is a command the reference has. */
function commandOf(args: readonly string[]): string {
  const known = reference();
  let depth = 0;
  while (depth < args.length && known.has(args.slice(0, depth + 1).join(" "))) depth += 1;
  if (depth === 0) {
    throw new ContractViolation(CONTRACT, `gh has no command ${JSON.stringify(args.slice(0, 2).join(" "))}`);
  }
  return args.slice(0, depth).join(" ");
}

/**
 * One flag at `index`, in any of the spellings gh's flag parser takes:
 * `--name value`, `--name=value`, `-x value` and `-xvalue`.
 */
function readFlag(
  command: string,
  flags: readonly Flag[],
  args: readonly string[],
  index: number,
): { flag: string; value: string; next: number } {
  const arg = args[index]!;
  const long = arg.startsWith("--");
  const equals = arg.indexOf("=");
  const name = long ? arg.slice(2, equals === -1 ? undefined : equals) : arg.slice(1, 2);
  const flag = flags.find((candidate) => (long ? candidate.long === name : candidate.short === name));
  if (!flag) throw new ContractViolation(CONTRACT, `gh ${command} takes no flag ${long ? "--" : "-"}${name}`);

  if (!flag.takesValue) return { flag: flag.long, value: "", next: index };
  if (long && equals !== -1) return { flag: flag.long, value: arg.slice(equals + 1), next: index };
  if (!long && arg.length > 2) return { flag: flag.long, value: arg.slice(2), next: index };
  if (index + 1 >= args.length) throw new ContractViolation(CONTRACT, `gh ${command} --${flag.long} needs a value`);
  return { flag: flag.long, value: args[index + 1]!, next: index + 1 };
}

function flagsOf(command: string): Flag[] {
  const words = command.split(" ");
  const flags: Flag[] = [];
  for (let depth = words.length; depth > 0; depth -= 1) {
    flags.push(...(reference().get(words.slice(0, depth).join(" "))?.flags ?? []));
  }
  return flags;
}

function assertJsonFields(command: string, list: string): void {
  if (!command.startsWith("pr ")) return;
  const unknown = list.split(",").filter((field) => !pullRequestJsonFields().has(field));
  if (unknown.length > 0) throw new ContractViolation(CONTRACT, `gh ${command} --json has no field ${unknown.join(", ")}`);
}

function apiRequest(request: GhRequest, raw: string[], magic: string[]): NonNullable<GhRequest["api"]> {
  const endpoint = request.positionals[0];
  if (!endpoint) throw new ContractViolation(CONTRACT, "gh api needs an endpoint");

  const params = parseFields(raw, magic);
  const passed = request.flags.get("method")?.at(-1);
  const method = (passed ?? (Object.keys(params).length > 0 ? "POST" : "GET")).toUpperCase();
  const jq = request.flags.has("jq");

  if (endpoint === "graphql") {
    const { query, operationName: _operationName, ...variables } = params;
    if (typeof query !== "string") throw new ContractViolation(CONTRACT, "gh api graphql needs a string field query");
    return { method, endpoint, params, jq, document: assertValidRequest("github", query, variables) };
  }

  const { operation } = operationFor(method, endpoint);
  assertValidParameters(method, operation, params);
  return { method, endpoint, params, jq };
}

/**
 * gh's own field parser, rule for rule: raw fields first, then typed ones;
 * `key[]` appends to a list and `key[sub]` nests; any other key claimed
 * twice is refused with gh's own words.
 */
function parseFields(raw: readonly string[], magic: readonly string[]): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const field of raw) assign(params, field, false);
  for (const field of magic) assign(params, field, true);
  return params;
}

/** `key=value`, `key[]=value`, `key[sub]=value`, split the way gh splits them. */
function splitField(field: string, isMagic: boolean): { stack: string[]; value: unknown } {
  const separator = field.indexOf("=");
  const key = separator === -1 ? field : field.slice(0, separator);
  const bracket = key.indexOf("[");
  const stack = bracket === -1 ? [key] : [key.slice(0, bracket), ...key.slice(bracket + 1, -1).split("][")];

  if (stack[0] === "") throw new ContractViolation(CONTRACT, `invalid key: ${JSON.stringify(field)}`);
  if (separator === -1) {
    if (stack.at(-1) !== "") {
      throw new ContractViolation(CONTRACT, `field ${JSON.stringify(field)} requires a value separated by an '=' sign`);
    }
    return { stack, value: undefined };
  }
  const value = field.slice(separator + 1);
  return { stack, value: isMagic ? magicValue(value) : value };
}

function assign(params: Record<string, unknown>, field: string, isMagic: boolean): void {
  const { stack, value } = splitField(field, isMagic);
  const isArray = stack.at(-1) === "";
  const subkey = isArray ? stack.at(-2)! : stack.at(-1)!;
  const destination = nested(params, stack.slice(0, isArray ? -2 : -1).filter(Boolean));

  if (!isArray) {
    if (subkey in destination) {
      throw new ContractViolation(CONTRACT, `unexpected override existing field under ${JSON.stringify(subkey)}`);
    }
    destination[subkey] = value;
    return;
  }
  const existing = destination[subkey] ?? [];
  if (!Array.isArray(existing)) {
    throw new ContractViolation(CONTRACT, `expected array type under ${JSON.stringify(subkey)}`);
  }
  destination[subkey] = value === undefined ? existing : [...existing, value];
}

function nested(params: Record<string, unknown>, path: readonly string[]): Record<string, unknown> {
  let destination = params;
  for (const part of path) {
    const next = destination[part] ?? {};
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      throw new ContractViolation(CONTRACT, `expected map type under ${JSON.stringify(part)}`);
    }
    destination[part] = next;
    destination = next as Record<string, unknown>;
  }
  return destination;
}

function magicValue(value: string): unknown {
  if (value.startsWith("@")) throw new ContractViolation(CONTRACT, "a field read from a file has no scripted file to read");
  if (/^[-+]?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  return value;
}

/**
 * Refuses a scripted answer the invocation could never print: a GraphQL
 * answer is held to the document, a REST one to its operation, and a
 * `gh pr list --json` to exactly the fields it asked for. A `--jq` answer is
 * whatever the filter made of it, and is not held to anything.
 */
export function assertValidGhAnswer(request: GhRequest, stdout: string): void {
  if (request.flags.has("jq") || request.flags.has("template") || stdout === "") return;

  const answer = parseAnswer(request, stdout);
  if (answer === undefined) return;

  if (request.api?.document) {
    const body = answer as { data?: unknown; errors?: unknown };
    if (body.errors === undefined) assertValidResponse("github", request.api.document, body.data);
  } else if (request.api) {
    assertValidAnswer(operationFor(request.api.method, request.api.endpoint).operation, answer);
  } else if (request.flags.has("json")) {
    assertJsonAnswer(request.command, request.flags.get("json")!.at(-1)!, answer);
  }
}

/** The JSON a command prints, or nothing for one that prints text. */
function parseAnswer(request: GhRequest, stdout: string): unknown {
  try {
    return JSON.parse(stdout) as unknown;
  } catch {
    if (request.api || request.flags.has("json")) {
      throw new ContractViolation(CONTRACT, `gh ${request.command} prints JSON, and the script answers ${JSON.stringify(stdout.slice(0, 60))}`);
    }
    return undefined;
  }
}

function assertJsonAnswer(command: string, fields: string, answer: unknown): void {
  const asked = fields.split(",").sort().join(",");
  for (const item of Array.isArray(answer) ? answer : [answer]) {
    const keys = Object.keys(item as object).sort().join(",");
    if (keys !== asked) {
      throw new ContractViolation(CONTRACT, `gh ${command} --json ${fields} prints exactly those fields, and the script answers {${keys}}`);
    }
  }
}

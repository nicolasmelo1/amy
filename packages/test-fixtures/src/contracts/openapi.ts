import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { ContractViolation, contractFile } from "./violation.js";

const CONTRACT = "github-rest";

interface Schema {
  $ref?: string;
  type?: string | string[];
  nullable?: boolean;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema;
  required?: string[];
  items?: Schema;
  oneOf?: Schema[];
  anyOf?: Schema[];
  allOf?: Schema[];
}

interface Parameter {
  $ref?: string;
  name: string;
  in: string;
  required?: boolean;
  schema?: Schema;
}

interface Operation {
  parameters?: Parameter[];
  requestBody?: { $ref?: string; required?: boolean; content?: Record<string, { schema?: Schema }> };
  responses?: Record<string, { $ref?: string; content?: Record<string, { schema?: Schema }> }>;
}

interface Description {
  paths: Record<string, Record<string, Operation>>;
  components: Record<string, Record<string, unknown>>;
}

let description: Description | undefined;

function openapi(): Description {
  description ??= JSON.parse(gunzipSync(readFileSync(contractFile("github-rest.json.gz"))).toString("utf8")) as Description;
  return description;
}

function resolve<T extends { $ref?: string }>(node: T): T {
  let current: T = node;
  while (current.$ref) {
    const [, , group, name] = current.$ref.split("/");
    current = openapi().components[group!]![name!] as T;
    if (!current) throw new ContractViolation(CONTRACT, `the description names ${node.$ref} and does not define it`);
  }
  return current;
}

/**
 * The one operation a method and a concrete path reach. Among the templates
 * that match, the one with the most literal segments wins, which is how the
 * service routes `/repos/o/r/pulls/7/merge` past `/repos/{owner}/{repo}/…`.
 */
export function operationFor(method: string, endpoint: string): { template: string; operation: Operation } {
  const path = `/${endpoint.replace(/^\//, "").split("?")[0]}`;
  const segments = path.split("/");

  const candidates = Object.keys(openapi().paths)
    .filter((template) => {
      const parts = template.split("/");
      return (
        parts.length === segments.length &&
        parts.every((part, index) => (part.startsWith("{") ? segments[index] !== "" : part === segments[index]))
      );
    })
    .sort((a, b) => literals(b) - literals(a));

  if (candidates.length === 0) throw new ContractViolation(CONTRACT, `no path in the REST API matches ${path}`);
  const template = candidates[0]!;
  const operation = openapi().paths[template]![method.toLowerCase()];
  if (!operation) throw new ContractViolation(CONTRACT, `${template} does not answer ${method.toUpperCase()}`);
  return { template, operation };
}

function literals(template: string): number {
  return template.split("/").filter((part) => part !== "" && !part.startsWith("{")).length;
}

/**
 * Refuses parameters the operation does not take, or takes in another type.
 * A GET carries them in the query string; everything else in the JSON body,
 * which is how `gh api` sends them.
 */
export function assertValidParameters(method: string, operation: Operation, params: Record<string, unknown>): void {
  if (method.toUpperCase() === "GET") {
    const query = (operation.parameters ?? []).map(resolve).filter((parameter) => parameter.in === "query");
    for (const [name, value] of Object.entries(params)) {
      const parameter = query.find((candidate) => candidate.name === name);
      if (!parameter) throw new ContractViolation(CONTRACT, `the query parameter ${name} is not one this operation takes`);
      if (parameter.schema) check(parameter.schema, value, `query.${name}`, true);
    }
    return;
  }

  const body = operation.requestBody ? resolve(operation.requestBody) : undefined;
  const schema = body?.content?.["application/json"]?.schema;
  if (!schema) {
    if (Object.keys(params).length > 0) throw new ContractViolation(CONTRACT, "this operation takes no body, and one was sent");
    return;
  }
  if (Object.keys(params).length === 0 && !body?.required) return;
  check(schema, params, "body", true);
}

/**
 * Refuses an answer the operation could never send. Every property the
 * fixture carries must be one the description declares, in its type; a
 * fixture may leave properties out, because a REST answer is the whole
 * resource and a fixture carries the part the adapter reads.
 */
export function assertValidAnswer(operation: Operation, answer: unknown): void {
  const responses = operation.responses ?? {};
  const status = Object.keys(responses).find((code) => code.startsWith("2"));
  if (!status) throw new ContractViolation(CONTRACT, "this operation declares no successful answer");
  const schema = resolve(responses[status]!).content?.["application/json"]?.schema;
  if (!schema) {
    if (answer !== undefined) throw new ContractViolation(CONTRACT, `a ${status} here carries no body, and the script answers one`);
    return;
  }
  check(schema, answer, "answer", false);
}

function check(node: Schema, value: unknown, at: string, requireRequired: boolean): void {
  const failure = mismatch(node, value, at, requireRequired);
  if (failure) throw new ContractViolation(CONTRACT, failure);
}

function mismatch(node: Schema, value: unknown, at: string, requireRequired: boolean): string | null {
  const schema = resolve(node);
  const combined = combinators(schema, value, at, requireRequired);
  if (combined !== undefined) return combined;

  return (
    primitive(schema, value, at) ??
    (value === null ? null : items(schema, value, at, requireRequired) ?? properties(schema, value, at, requireRequired))
  );
}

/**
 * `allOf` must all hold; `oneOf` and `anyOf` need one. Answers `undefined`
 * where the combinators leave the schema's own keywords still to check.
 */
function combinators(schema: Schema, value: unknown, at: string, requireRequired: boolean): string | null | undefined {
  for (const part of schema.allOf ?? []) {
    const failure = mismatch(part, value, at, requireRequired);
    if (failure) return failure;
  }
  const alternatives = schema.oneOf ?? schema.anyOf;
  if (!alternatives) return undefined;

  const failures = alternatives.map((part) => mismatch(part, value, at, requireRequired));
  if (failures.every(Boolean)) return failures[0]!;
  return schema.type || schema.properties ? undefined : null;
}

function primitive(schema: Schema, value: unknown, at: string): string | null {
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (value === null) {
    const allowed = schema.nullable || types.length === 0 || types.includes("null");
    return allowed ? null : `${at} is null, and the description does not allow it`;
  }
  if (types.length > 0 && !types.some((type) => fits(type, value))) {
    return `${at} is ${types.join(" or ")}, and holds ${JSON.stringify(value)}`;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    return `${at} is one of ${schema.enum.map((option) => JSON.stringify(option)).join(", ")}, and holds ${JSON.stringify(value)}`;
  }
  return null;
}

function items(schema: Schema, value: unknown, at: string, requireRequired: boolean): string | null {
  if (!Array.isArray(value) || !schema.items) return null;
  for (const [index, item] of value.entries()) {
    const failure = mismatch(schema.items, item, `${at}[${index}]`, requireRequired);
    if (failure) return failure;
  }
  return null;
}

function properties(schema: Schema, value: unknown, at: string, requireRequired: boolean): string | null {
  if (typeof value !== "object" || Array.isArray(value) || !schema.properties) return null;
  const record = value as Record<string, unknown>;

  for (const [key, item] of Object.entries(record)) {
    const property = schema.properties[key];
    if (!property) {
      if (!schema.additionalProperties) return `${at}.${key} is not a property the description declares`;
      continue;
    }
    const failure = mismatch(property, item, `${at}.${key}`, requireRequired);
    if (failure) return failure;
  }

  const missing = requireRequired ? (schema.required ?? []).filter((key) => !(key in record)) : [];
  return missing.length > 0 ? `${at} is missing ${missing.join(", ")}, which the description requires` : null;
}

function fits(type: string, value: unknown): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "integer":
      return Number.isInteger(value);
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && !Array.isArray(value);
    default:
      return true;
  }
}

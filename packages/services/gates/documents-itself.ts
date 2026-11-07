// L4.THE_CONTRACT_DOCUMENTS_ITSELF: every operation in packages/services/openapi.json
// says what it is, every property says what it holds, every input and output
// has an example, every error is the envelope and every code is
// `<domain>.<reason>` (docs/design/amy-speaks-in-domains.md).
import fs from "node:fs";
import path from "node:path";
import { report, services } from "./read.js";

type Json = Record<string, unknown>;
const CODE = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9_]*$/;
const findings: string[] = [];
const file = path.join(services, "openapi.json");

if (!fs.existsSync(file)) {
  findings.push("packages/services/openapi.json does not exist: `npm run build` writes it from the contract");
} else {
  const document = JSON.parse(fs.readFileSync(file, "utf8")) as Json;
  if (document.openapi !== "3.1.0") findings.push(`packages/services/openapi.json is OpenAPI ${String(document.openapi)}, not 3.1.0`);
  checkEnvelope(document);
  for (const [route, methods] of Object.entries((document.paths ?? {}) as Record<string, Record<string, Json>>)) {
    for (const [method, operation] of Object.entries(methods)) checkOperation(`${method.toUpperCase()} ${route}`, operation);
  }
}

function checkEnvelope(document: Json): void {
  const error = ((document.components as Json | undefined)?.schemas as Json | undefined)?.Error as Json | undefined;
  const required = (error?.required ?? []) as string[];
  if (!error || !required.includes("code") || !required.includes("message")) {
    findings.push("components.schemas.Error is not the envelope { code, message, details? }");
  }
}

function checkOperation(where: string, operation: Json): void {
  const id = typeof operation.operationId === "string" && operation.operationId ? operation.operationId : undefined;
  const name = id ?? where;
  if (!id) findings.push(`${where} has no operationId`);
  for (const field of ["summary", "description", "x-amy-domain"]) {
    if (typeof operation[field] !== "string" || operation[field] === "") findings.push(`\`${name}\` has no ${field}`);
  }
  if (typeof operation["x-amy-local-only"] !== "boolean") findings.push(`\`${name}\` has no x-amy-local-only`);
  if (!Array.isArray(operation["x-amy-writes"])) findings.push(`\`${name}\` has no x-amy-writes`);
  checkExamples(name, operation["x-amy-examples"]);
  for (const [at, schema] of schemasOf(operation)) checkDescribed(name, at, schema);
  checkErrors(name, operation);
}

function checkExamples(name: string, examples: unknown): void {
  const first = Array.isArray(examples) ? (examples[0] as Json | undefined) : undefined;
  if (!first || !("input" in first) || !("output" in first)) findings.push(`\`${name}\` has no example of its input and its output`);
}

function schemasOf(operation: Json): [string, Json][] {
  return [...inputSchemas(operation), ...outputSchemas(operation)];
}

function inputSchemas(operation: Json): [string, Json][] {
  const found: [string, Json][] = [];
  const body = ((operation.requestBody as Json | undefined)?.content as Record<string, Json> | undefined)?.["application/json"]?.schema as Json | undefined;
  if (body) found.push(["input", body]);
  for (const parameter of (operation.parameters ?? []) as Json[]) {
    if (typeof parameter.description !== "string" || parameter.description === "") findings.push(`\`${String(operation.operationId)}\` input property \`${String(parameter.name)}\` has no description`);
    if (parameter.schema) found.push([`input.${String(parameter.name)}`, parameter.schema as Json]);
  }
  return found;
}

function outputSchemas(operation: Json): [string, Json][] {
  const answers = Object.entries((operation.responses ?? {}) as Record<string, Json>).filter(([status]) => status !== "default");
  return answers.flatMap(([, response]) =>
    Object.values((response.content ?? {}) as Record<string, Json>).flatMap((media): [string, Json][] => {
      const events = media["x-amy-events"] as Record<string, Json> | undefined;
      if (events) return Object.entries(events).map(([event, schema]): [string, Json] => [`event ${event}`, schema]);
      return media.schema ? [["output", media.schema as Json]] : [];
    }),
  );
}

/** Every property, at any depth, carries a description. */
function checkDescribed(name: string, at: string, schema: Json): void {
  for (const [property, inner] of Object.entries((schema.properties ?? {}) as Record<string, Json>)) {
    if (typeof inner.description !== "string" || inner.description === "") findings.push(`\`${name}\` ${at} property \`${property}\` has no description`);
    checkDescribed(name, `${at}.${property}`, inner);
  }
  for (const [where, inner] of nested(at, schema)) checkDescribed(name, where, inner);
}

/** The schemas inside one that are not its properties: items, branches, and the $defs a $ref points at. */
function nested(at: string, schema: Json): [string, Json][] {
  const found: [string, Json][] = [];
  for (const key of ["items", "additionalProperties"]) {
    if (schema[key] && typeof schema[key] === "object") found.push([`${at}[]`, schema[key] as Json]);
  }
  for (const key of ["anyOf", "oneOf", "allOf"]) found.push(...((schema[key] ?? []) as Json[]).map((branch): [string, Json] => [at, branch]));
  for (const [definition, inner] of Object.entries((schema.$defs ?? {}) as Record<string, Json>)) found.push([`${at}.$defs.${definition}`, inner]);
  return found;
}

function checkErrors(name: string, operation: Json): void {
  const failure = (((operation.responses as Json | undefined)?.default as Json | undefined)?.content as Record<string, Json> | undefined)?.["application/json"]?.schema as Json | undefined;
  const envelope = ((failure?.allOf ?? []) as Json[]).some((one) => one.$ref === "#/components/schemas/Error");
  if (!envelope) findings.push(`\`${name}\` answers its errors with something other than the envelope`);
  const domain = String(operation["x-amy-domain"]);
  for (const code of Object.keys((failure?.["x-amy-errors"] ?? {}) as Json)) {
    if (!CODE.test(code) || !code.startsWith(`${domain}.`)) findings.push(`\`${name}\` declares the error \`${code}\`, which is not \`${domain}.<reason>\``);
  }
}

report("L4.THE_CONTRACT_DOCUMENTS_ITSELF", findings);

import { readFileSync } from "node:fs";
import { ContractViolation, contractFile } from "./violation.js";

const CONTRACT = "telegram-bot-api";

interface Field {
  type: string;
  required: boolean;
}

interface Contract {
  version: string;
  types: Record<string, Record<string, Field>>;
  methods: Record<string, { parameters: Record<string, Field>; returns: string }>;
}

let contract: Contract | undefined;

function botApi(): Contract {
  contract ??= JSON.parse(readFileSync(contractFile("telegram-bot-api.json"), "utf8")) as Contract;
  return contract;
}

function method(name: string): Contract["methods"][string] {
  const found = botApi().methods[name];
  if (!found) throw new ContractViolation(CONTRACT, `the Bot API has no method ${name}`);
  return found;
}

/**
 * Refuses a call Telegram would not take: a method it does not have, a
 * parameter the method does not list, one of the wrong type, or a required
 * one left out.
 */
export function assertValidBotApiCall(name: string, args: Record<string, unknown>): void {
  const { parameters } = method(name);
  for (const [parameter, value] of Object.entries(args)) {
    const field = parameters[parameter];
    if (!field) throw new ContractViolation(CONTRACT, `${name} takes no parameter ${parameter}`);
    const failure = mismatch(field.type, value, `${name}.${parameter}`);
    if (failure) throw new ContractViolation(CONTRACT, failure);
  }
  for (const [parameter, field] of Object.entries(parameters)) {
    if (field.required && args[parameter] === undefined) {
      throw new ContractViolation(CONTRACT, `${name} requires ${parameter}, and it was not sent`);
    }
  }
}

/**
 * Refuses a result the method could never return: every field must be one
 * its type lists, in its type, and every field the type requires present.
 */
export function assertValidBotApiResult(name: string, result: unknown): void {
  const { returns } = method(name);
  if (!returns) throw new ContractViolation(CONTRACT, `the Bot API page does not say what ${name} returns`);
  const failure = mismatch(returns, result, `${name}()`);
  if (failure) throw new ContractViolation(CONTRACT, failure);
}

/** The Bot API version the vendored contract describes. */
export function botApiVersion(): string {
  return botApi().version;
}

function mismatch(type: string, value: unknown, at: string): string | null {
  const alternatives = type.split(/\s+or\s+|,\s*/).map((one) => one.trim()).filter(Boolean);
  const failures = alternatives.map((one) => single(one, value, at));
  return failures.some((failure) => failure === null) ? null : failures[0]!;
}

/** The Bot API's scalar types, by the name its page writes them with. */
const SCALARS: Record<string, (value: unknown) => boolean> = {
  Integer: (value) => Number.isInteger(value),
  Float: (value) => typeof value === "number",
  "Float number": (value) => typeof value === "number",
  String: (value) => typeof value === "string",
  Boolean: (value) => typeof value === "boolean",
  True: (value) => value === true,
  InputFile: () => true,
};

function single(type: string, value: unknown, at: string): string | null {
  const array = /^Array of (.+)$/.exec(type);
  if (array) return arrayOf(array[1]!, type, value, at);
  const scalar = SCALARS[type];
  if (scalar) return scalar(value) ? null : `${at} is ${type}, and holds ${JSON.stringify(value)}`;
  return object(type, value, at);
}

function arrayOf(item: string, type: string, value: unknown, at: string): string | null {
  if (!Array.isArray(value)) return `${at} is ${type}, and holds ${JSON.stringify(value)}`;
  for (const [index, one] of value.entries()) {
    const failure = mismatch(item, one, `${at}[${index}]`);
    if (failure) return failure;
  }
  return null;
}

function object(type: string, value: unknown, at: string): string | null {
  const fields = botApi().types[type];
  if (!fields) return `${at} is a ${type}, which the Bot API does not define`;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return `${at} is a ${type}, and holds ${JSON.stringify(value)}`;
  const given = value as Record<string, unknown>;
  for (const [name, field] of Object.entries(given)) {
    const declared = fields[name];
    if (!declared) return `${at}.${name} is not a field of ${type}`;
    const failure = mismatch(declared.type, field, `${at}.${name}`);
    if (failure) return failure;
  }
  const missing = Object.entries(fields).find(([name, field]) => field.required && given[name] === undefined);
  return missing ? `${at} is a ${type}, and has no ${missing[0]}` : null;
}

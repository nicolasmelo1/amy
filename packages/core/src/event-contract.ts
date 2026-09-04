import fs from "node:fs";
import { Event } from "./ports/EventLog.js";

/** The vocabulary a declared field can be written in. `?` means optional. */
export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "string?"
  | "number?"
  | "boolean?"
  | "object?"
  | "array?";

export interface KindContract {
  /** What the line means, in one sentence, for whoever reads the log later. */
  says: string;
  /** Which top-level fields this kind cannot be written without. */
  requires: readonly string[];
  detail: Readonly<Record<string, FieldType>>;
}

export interface EventContract {
  version: number;
  kinds: Readonly<Record<string, KindContract>>;
}

let contract: EventContract | null = null;

/**
 * The declared contract, read from the vendored `events.json`.
 *
 * Read from disk rather than imported so the file stays a plain artifact a
 * hash lock can watch, the same way the model price table does.
 */
export function eventContract(): EventContract {
  if (contract) return contract;

  const file = new URL("../events.json", import.meta.url);
  contract = JSON.parse(fs.readFileSync(file, "utf-8")) as EventContract;
  return contract;
}

/** A field is absent when it is missing, `null` or `undefined`. */
function absent(value: unknown): boolean {
  return value === null || value === undefined;
}

function typeOf(value: unknown): string {
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function wrongType(value: unknown, declared: FieldType): boolean {
  return typeOf(value) !== declared.replace("?", "");
}

function detailViolations(kind: string, detail: Record<string, unknown>, of: KindContract): string[] {
  const problems: string[] = [];

  for (const [field, declared] of Object.entries(of.detail)) {
    const value = detail[field];
    if (absent(value)) {
      if (!declared.endsWith("?")) problems.push(`${kind}: detail.${field} is required`);
      continue;
    }
    if (wrongType(value, declared)) {
      problems.push(`${kind}: detail.${field} should be ${declared}, got ${typeOf(value)}`);
    }
  }

  for (const field of Object.keys(detail)) {
    if (!(field in of.detail)) {
      problems.push(`${kind}: detail.${field} is not declared in events.json`);
    }
  }

  return problems;
}

/**
 * What a line breaks in the contract, or nothing if it keeps it.
 *
 * An undeclared `detail` field is a violation, not a courtesy: a field that
 * slips in unannounced is how the declaration rots into fiction while every
 * reader carries on guessing.
 */
export function checkEvent(event: Event, against: EventContract = eventContract()): string[] {
  const of = against.kinds[event.kind];
  if (!of) return [`${String(event.kind)} is not a kind events.json declares`];

  const problems: string[] = [];
  const top = event as unknown as Record<string, unknown>;

  if (absent(event.at)) problems.push(`${event.kind}: at is required`);

  for (const field of of.requires) {
    if (absent(top[field])) problems.push(`${event.kind}: ${field} is required`);
  }

  return [...problems, ...detailViolations(event.kind, event.detail ?? {}, of)];
}

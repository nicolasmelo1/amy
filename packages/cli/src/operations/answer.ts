import { defineContract, invoke, isStream } from "@amykit/core";
import type { ErrorEnvelope, Invocation, Operation, OperationContext, StreamItem } from "@amykit/core";
import { spelledAs } from "./argv.js";
import { draw, drawEvent } from "./draw.js";
import { Json, jsonSchemaOf } from "./schema.js";

/**
 * The exit code is the outcome: an output, a declared error, an input the
 * schema refused, or something the operation never declared.
 */
export const EXIT = { output: 0, error: 1, refused: 2, internal: 70 } as const;

/** Where an answer is written: the output to one stream, an error to the other. */
export interface Speaker {
  line(text?: string): void;
  error(text: string): void;
}

/** How the answer is written: as JSON for whatever reads it, or drawn for a person. */
export interface Manner {
  readonly json: boolean;
  readonly color: boolean;
}

/**
 * Runs one operation through `invoke` and writes what it answered, returning
 * the exit code.
 *
 * With `json`, an output is JSON on stdout, a stream one JSON line per event,
 * and an error the envelope on stderr. Without it, the output is drawn from
 * itself and its schema, and an error is its message.
 */
export async function answer(operation: Operation, input: unknown, context: OperationContext, manner: Manner, out: Speaker): Promise<number> {
  const ran = await invoke(defineContract([operation]), operation.id, input, context);
  try {
    return await speak(operation, ran, manner, out);
  } catch (error) {
    // An output its schema accepts can still be one nothing can print — a
    // BigInt under `unknown` has no JSON — and that is the operation's
    // internal error, said the way it was asked for, not a crash of the door.
    const message = `\`${operation.id}\` answered something that cannot be printed: ${error instanceof Error ? error.message : String(error)}`;
    return refuse({ code: "amy.internal", message }, EXIT.internal, manner, out);
  }
}

async function speak(operation: Operation, ran: Invocation, manner: Manner, out: Speaker): Promise<number> {
  switch (ran.kind) {
    case "output":
      return printed(operation, ran.output, manner, out);
    case "stream":
      return streamed(operation, ran.events, manner, out);
    case "error":
      return refuse(ran.error, EXIT.error, manner, out);
    case "refused":
      return refuse(namingFlags(operation, ran.error), EXIT.refused, manner, out);
    case "internal":
      return refuse(ran.error, EXIT.internal, manner, out);
  }
}

function printed(operation: Operation, output: unknown, manner: Manner, out: Speaker): number {
  if (manner.json) out.line(JSON.stringify(output, null, 2));
  else for (const line of draw(output, outputSchemaOf(operation), manner.color)) out.line(line);
  return EXIT.output;
}

/** Each event as it arrives; an error that ends the stream is written after the events before it. */
async function streamed(operation: Operation, events: AsyncIterable<StreamItem>, manner: Manner, out: Speaker): Promise<number> {
  for await (const item of events) {
    if (item.kind !== "event") return refuse(item.error, item.kind === "error" ? EXIT.error : EXIT.internal, manner, out);
    if (manner.json) out.line(JSON.stringify({ event: item.event, data: item.data }));
    else for (const line of drawEvent(item.event, item.data, eventSchemaOf(operation, item.event), manner.color)) out.line(line);
  }
  return EXIT.output;
}

/** Writes an error, as the envelope or as its message, and answers its exit code. */
export function refuse(error: ErrorEnvelope, code: number, manner: Pick<Manner, "json">, out: Speaker): number {
  out.error(manner.json ? JSON.stringify(error) : error.message);
  return code;
}

/**
 * An input the schema refused, said in the words it was typed in: each issue
 * names the flag or the argument, never the field behind it.
 */
function namingFlags(operation: Operation, error: ErrorEnvelope): ErrorEnvelope {
  if (error.code !== "amy.input" || !Array.isArray(error.details)) return error;
  const issues = error.details as { message: string; path: string[] }[];
  const said = issues.map((issue) => {
    const [field, ...rest] = issue.path;
    if (field === undefined) return issue.message;
    return `${spelledAs(operation, field)}${rest.length > 0 ? `.${rest.join(".")}` : ""}: ${issue.message}`;
  });
  return { ...error, message: `\`amy ${(operation.cli?.words ?? [operation.id]).join(" ")}\` refused its input: ${said.join("; ")}` };
}

function outputSchemaOf(operation: Operation): Json | undefined {
  if (isStream(operation)) return undefined;
  return jsonSchemaOf(operation.output, "output");
}

function eventSchemaOf(operation: Operation, event: string): Json | undefined {
  if (!isStream(operation) || !Object.hasOwn(operation.events, event)) return undefined;
  return jsonSchemaOf(operation.events[event]!, "output");
}

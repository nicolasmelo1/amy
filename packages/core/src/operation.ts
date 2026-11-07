/**
 * One operation, declared once: what it takes, what it returns, what it can
 * fail with and how it is documented. Every door — the command line, the
 * server, the SDK, a workflow — reads this declaration and runs it through
 * `invoke`, so whichever door calls, the same code runs
 * (docs/design/amy-speaks-in-domains.md).
 */
import type { InferInput, InferOutput, OperationSchema, StandardIssue, StandardResult } from "./standard-schema.js";

/** What every failure looks like at every door. */
export interface ErrorEnvelope {
  /** `<domain>.<reason>` for a declared error; `amy.input`, `amy.output` or `amy.internal` otherwise. */
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

/** One error an operation says it can return, documented like the rest of it. */
export interface DeclaredError {
  readonly description: string;
}

/** An input with the output it produces, for the documentation and the tests. */
export interface OperationExample<Input, Output> {
  readonly summary: string;
  readonly input: Input;
  /** The output, or for a stream the events in the order they arrive. */
  readonly output: Output;
}

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/** Where the operation is reached over HTTP. */
export interface HttpBinding {
  readonly method: HttpMethod;
  /** An OpenAPI path, `{field}` naming an input field. */
  readonly path: string;
  /** The status of a successful answer; 200 when unsaid. */
  readonly status?: number;
}

/** How the operation is spelled on the command line, when it has a command at all. */
export interface CliBinding {
  readonly words: readonly string[];
  /** Input fields taken by position, in order; every other field is a flag. */
  readonly positional?: readonly string[];
}

/** What a handler is handed besides its input: the mounted ports, by name. */
export interface OperationContext {
  port(name: string): unknown;
}

/** One event a streaming operation yields. */
export interface StreamEvent<Name extends string = string, Data = unknown> {
  readonly event: Name;
  readonly data: Data;
}

const FAILURE: unique symbol = Symbol("amy.operation.failure");

/** A declared error, as a handler returns it. Made with `fail`. */
export interface Failure {
  readonly [FAILURE]: true;
  readonly error: ErrorEnvelope;
}

/** What a handler returns instead of its output to answer with a declared error. */
export function fail(code: string, message: string, details?: unknown): Failure {
  return { [FAILURE]: true, error: details === undefined ? { code, message } : { code, message, details } };
}

function isFailure(value: unknown): value is Failure {
  return typeof value === "object" && value !== null && FAILURE in value;
}

type EventSchemas = Readonly<Record<string, OperationSchema>>;
type EventOf<E extends EventSchemas> = { [K in keyof E & string]: StreamEvent<K, InferOutput<E[K]>> }[keyof E & string];

interface Declaration<I extends OperationSchema> {
  /** `<domain>.<verb-noun>`, unique in the contract. */
  readonly id: string;
  readonly domain: string;
  /** One line, what `--help` prints beside the command. */
  readonly summary: string;
  /** What it does and what it never does. */
  readonly description: string;
  readonly input: I;
  readonly errors?: Readonly<Record<string, DeclaredError>>;
  /** Callable only from this machine unless it says `false`. */
  readonly localOnly?: boolean;
  /** The ports it writes through; empty for a read. */
  readonly writes: readonly string[];
  /** Needs the machine assembled; read before mount otherwise. */
  readonly mount?: boolean;
  readonly http: HttpBinding;
  readonly cli?: CliBinding;
}

/** An operation that answers with one value. */
export interface ValueOperation<I extends OperationSchema = OperationSchema, O extends OperationSchema = OperationSchema> extends Declaration<I> {
  readonly output: O;
  readonly examples: readonly OperationExample<InferInput<I>, InferInput<O>>[];
  handler(input: InferOutput<I>, context: OperationContext): Promise<InferInput<O> | Failure>;
}

/** An operation that answers with named events, in order. */
export interface StreamOperation<I extends OperationSchema = OperationSchema, E extends EventSchemas = EventSchemas> extends Declaration<I> {
  readonly events: E;
  readonly examples: readonly OperationExample<InferInput<I>, readonly EventOf<E>[]>[];
  handler(input: InferOutput<I>, context: OperationContext): AsyncIterable<EventOf<E> | Failure>;
}

export type Operation = ValueOperation | StreamOperation;

/**
 * Declares one operation. The identity function, there for the types: input
 * and output are inferred from the schemas, never written by hand.
 */
export function defineOperation<I extends OperationSchema, O extends OperationSchema>(operation: ValueOperation<I, O>): ValueOperation<I, O>;
export function defineOperation<I extends OperationSchema, E extends EventSchemas>(operation: StreamOperation<I, E>): StreamOperation<I, E>;
export function defineOperation(operation: Operation): Operation {
  return operation;
}

export function isStream(operation: Operation): operation is StreamOperation {
  return "events" in operation;
}

/** Every operation a door can reach, by id. */
export interface Contract {
  readonly operations: ReadonlyMap<string, Operation>;
}

/**
 * Anything `defineOperation` returned. Its own schemas are erased here: a
 * contract holds operations of every shape, and `invoke` checks each one.
 */
export type DeclaredOperation = Pick<Operation, "id" | "domain" | "http">;

/** Joins operations into one contract, refusing an id declared twice. */
export function defineContract(operations: readonly DeclaredOperation[]): Contract {
  const byId = new Map<string, Operation>();
  for (const operation of operations) {
    if (byId.has(operation.id)) throw new Error(`the operation \`${operation.id}\` is declared twice`);
    byId.set(operation.id, operation as unknown as Operation);
  }
  return { operations: byId };
}

/** One item of a stream as `invoke` hands it on: an event, or the error that ended it. */
export type StreamItem =
  | { readonly kind: "event"; readonly event: string; readonly data: unknown }
  | { readonly kind: "error" | "internal"; readonly error: ErrorEnvelope };

/**
 * How an invocation ended: an output, a stream, a declared error, an input
 * the schema refused, or something the operation never declared.
 */
export type Invocation =
  | { readonly kind: "output"; readonly output: unknown }
  | { readonly kind: "stream"; readonly events: AsyncIterable<StreamItem> }
  | { readonly kind: "error" | "refused" | "internal"; readonly error: ErrorEnvelope };

/**
 * Runs one operation in process, validating the input before the handler and
 * the output after it against the operation's own schemas: the one road every
 * door takes. A code the operation never declared, a throw, or an output its
 * schema refuses comes back as internal, naming the operation.
 */
export async function invoke(contract: Contract, id: string, input: unknown, context: OperationContext): Promise<Invocation> {
  const operation = contract.operations.get(id);
  if (!operation) return { kind: "refused", error: { code: "amy.unknown_operation", message: `no operation \`${id}\` is in the contract` } };

  let accepted: StandardResult<unknown>;
  try {
    accepted = await validate(operation.input, input);
  } catch (error) {
    return { kind: "internal", error: thrown(id, error) };
  }
  if (accepted.issues) {
    return { kind: "refused", error: { code: "amy.input", message: `\`${id}\` refused its input: ${describe(accepted.issues)}`, details: plain(accepted.issues) } };
  }
  if (isStream(operation)) return { kind: "stream", events: streamed(operation, accepted.value, context) };

  let answered: unknown;
  try {
    answered = await operation.handler(accepted.value, context);
  } catch (error) {
    return { kind: "internal", error: thrown(id, error) };
  }
  if (isFailure(answered)) return declaredOrInternal(operation, answered.error);

  let output: StandardResult<unknown>;
  try {
    output = await validate(operation.output, answered);
  } catch (error) {
    return { kind: "internal", error: thrown(id, error) };
  }
  if (output.issues) {
    return { kind: "internal", error: { code: "amy.output", message: `\`${id}\` answered an output its schema refuses: ${describe(output.issues)}`, details: plain(output.issues) } };
  }
  return { kind: "output", output: output.value };
}

async function* streamed(operation: StreamOperation, input: unknown, context: OperationContext): AsyncGenerator<StreamItem> {
  try {
    for await (const item of operation.handler(input, context)) {
      if (isFailure(item)) {
        const ended = declaredOrInternal(operation, item.error);
        yield { kind: ended.kind === "error" ? "error" : "internal", error: ended.error };
        return;
      }
      const checked = await checkEvent(operation, item);
      yield checked;
      if (checked.kind !== "event") return;
    }
  } catch (error) {
    yield { kind: "internal", error: thrown(operation.id, error) };
  }
}

async function checkEvent(operation: StreamOperation, item: StreamEvent): Promise<StreamItem> {
  const schema = Object.hasOwn(operation.events, item.event) ? operation.events[item.event] : undefined;
  if (!schema) {
    return { kind: "internal", error: { code: "amy.output", message: `\`${operation.id}\` yielded \`${item.event}\`, an event it does not declare` } };
  }
  const data = await validate(schema, item.data);
  if (data.issues) {
    return { kind: "internal", error: { code: "amy.output", message: `\`${operation.id}\` yielded a \`${item.event}\` its schema refuses: ${describe(data.issues)}`, details: plain(data.issues) } };
  }
  return { kind: "event", event: item.event, data: data.value };
}

function declaredOrInternal(operation: Operation, error: ErrorEnvelope): { kind: "error" | "internal"; error: ErrorEnvelope } {
  if (operation.errors && Object.hasOwn(operation.errors, error.code)) return { kind: "error", error };
  return {
    kind: "internal",
    error: { code: "amy.internal", message: `\`${operation.id}\` failed with \`${error.code}\`, which it does not declare: ${error.message}`, details: error },
  };
}

function thrown(id: string, error: unknown): ErrorEnvelope {
  return { code: "amy.internal", message: `\`${id}\` threw: ${error instanceof Error ? error.message : String(error)}` };
}

async function validate(schema: OperationSchema, value: unknown): Promise<StandardResult<unknown>> {
  return schema["~standard"].validate(value);
}

/** Issues as plain data: a library's own issue objects may carry cycles no door can serialise. */
function plain(issues: readonly StandardIssue[]): { message: string; path: string[] }[] {
  return [...issues].map((issue) => ({
    message: issue.message,
    path: (issue.path ?? []).map((segment) => String(typeof segment === "object" ? segment.key : segment)),
  }));
}

function describe(issues: readonly StandardIssue[]): string {
  return plain(issues)
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
}

/** What the document says about the contract as a whole. */
export interface DocumentInfo {
  readonly title: string;
  /** Its major is the contract's: raised on purpose, the only way a breaking change gets through. */
  readonly version: string;
  readonly description: string;
}

const TARGET = { target: "draft-2020-12" } as const;
const ERROR_SCHEMA = {
  type: "object",
  description: "Every failure, at every door.",
  required: ["code", "message"],
  properties: {
    code: { type: "string", description: "`<domain>.<reason>` for a declared error, `amy.<reason>` for one the contract raised." },
    message: { type: "string", description: "What went wrong, for a person." },
    details: { description: "What the error carries beyond its message, when it carries anything." },
  },
} as const;

type Json = Record<string, unknown>;

/**
 * The contract as an OpenAPI 3.1 document: each operation one path and
 * method, its schemas in JSON Schema 2020-12 straight from the library that
 * declared them, `x-amy-local-only` and `x-amy-writes` on every operation.
 */
export function contractDocument(contract: Contract, info: DocumentInfo): Json {
  const paths: Record<string, Record<string, Json>> = {};
  const ordered = [...contract.operations.values()].sort((a, b) => a.id.localeCompare(b.id));
  for (const operation of ordered) {
    const at = (paths[operation.http.path] ??= {});
    if (at[operation.http.method]) throw new Error(`\`${operation.id}\` takes ${operation.http.method} ${operation.http.path}, which another operation already took`);
    at[operation.http.method] = describeOperation(operation);
  }
  return {
    openapi: "3.1.0",
    info: { title: info.title, version: info.version, description: info.description },
    paths,
    components: { schemas: { Error: ERROR_SCHEMA } },
  };
}

function describeOperation(operation: Operation): Json {
  const input = jsonSchema(operation.input, "input", `${operation.id}/input`);
  const takesBody = operation.http.method !== "get" && operation.http.method !== "delete";
  return {
    operationId: operation.id,
    summary: operation.summary,
    description: operation.description,
    tags: [operation.domain],
    "x-amy-domain": operation.domain,
    "x-amy-local-only": operation.localOnly ?? true,
    "x-amy-writes": [...operation.writes],
    "x-amy-examples": operation.examples.map((one) => ({ summary: one.summary, input: one.input, output: one.output })),
    ...(operation.cli ? { "x-amy-cli": { words: [...operation.cli.words], positional: [...(operation.cli.positional ?? [])] } } : {}),
    ...(takesBody ? bodyOf(operation, input) : { parameters: parametersOf(operation, input, () => true) }),
    responses: {
      [String(operation.http.status ?? 200)]: answerOf(operation),
      default: {
        description: "A declared error, an input the schema refused, or an internal error.",
        content: { "application/json": { schema: errorsOf(operation) } },
      },
    },
  };
}

function answerOf(operation: Operation): Json {
  const example = operation.examples[0];
  if (isStream(operation)) {
    const events = Object.fromEntries(Object.entries(operation.events).map(([name, schema]) => [name, jsonSchema(schema, "output", `${operation.id}/events/${name}`)]));
    return {
      description: `A stream of ${Object.keys(events).map((name) => `\`${name}\``).join(", ")} events.`,
      content: {
        "text/event-stream": {
          schema: { type: "string", description: "Server-sent events, one per event the operation yields." },
          "x-amy-events": events,
          ...(example ? { example: example.output } : {}),
        },
      },
    };
  }
  return {
    description: operation.summary,
    content: { "application/json": { schema: jsonSchema(operation.output, "output", `${operation.id}/output`), ...(example ? { example: example.output } : {}) } },
  };
}

function errorsOf(operation: Operation): Json {
  const declared = Object.entries(operation.errors ?? {});
  return {
    allOf: [{ $ref: "#/components/schemas/Error" }],
    "x-amy-errors": Object.fromEntries(declared.map(([code, error]) => [code, { description: error.description }])),
  };
}

/** The input fields as parameters: those `taken` says, in the path when the path names them, in the query otherwise. */
function parametersOf(operation: Operation, input: Json, taken: (name: string) => boolean): Json[] {
  const properties = (input.properties ?? {}) as Record<string, Json>;
  const required = new Set((input.required ?? []) as string[]);
  return Object.entries(properties)
    .filter(([name]) => taken(name))
    .map(([name, schema]) => {
      const inPath = inPathOf(operation, name);
      return {
        name,
        in: inPath ? "path" : "query",
        required: inPath || required.has(name),
        description: typeof schema.description === "string" ? schema.description : "",
        schema,
      };
    });
}

function inPathOf(operation: Operation, name: string): boolean {
  return operation.http.path.includes(`{${name}}`);
}

/**
 * A method with a body: the fields its path names are path parameters, and
 * every other field is the body, so a URL can be built and the body holds
 * no field twice.
 */
function bodyOf(operation: Operation, input: Json): Json {
  const inPath = (name: string): boolean => inPathOf(operation, name);
  const parameters = parametersOf(operation, input, inPath);
  const properties = Object.fromEntries(Object.entries((input.properties ?? {}) as Record<string, Json>).filter(([name]) => !inPath(name)));
  const required = ((input.required ?? []) as string[]).filter((name) => !inPath(name));
  const example = operation.examples[0];
  const exampleBody = example && typeof example.input === "object" && example.input !== null
    ? Object.fromEntries(Object.entries(example.input as Record<string, unknown>).filter(([name]) => !inPath(name)))
    : example?.input;
  const schema = { ...input, properties, ...(required.length > 0 || input.required ? { required } : {}) };
  return {
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(parameters.length > 0 && Object.keys(properties).length === 0
      ? {}
      : { requestBody: { required: true, content: { "application/json": { schema, ...(example ? { example: exampleBody } : {}) } } } }),
  };
}

/**
 * A schema as the library wrote it, without its dialect line. One carrying
 * `$defs` gets an `$id`, so its `#/$defs/...` references resolve inside it
 * rather than against the root of the OpenAPI document.
 */
function jsonSchema(schema: OperationSchema, side: "input" | "output", at: string): Json {
  const { $schema: _dialect, ...rest } = schema["~standard"].jsonSchema[side](TARGET);
  return rest.$defs && rest.$id === undefined ? { $id: `urn:amy:operation:${at}`, ...rest } : rest;
}

import { Command, Option } from "commander";
import type { Operation } from "@amykit/core";
import { Json, flagOf, inputSchemaOf, resolved, typeOf } from "./schema.js";

/** One input field as the command line spells it. */
interface Field {
  readonly name: string;
  readonly schema: Json;
  readonly required: boolean;
  /** Its place among the positional arguments, when it is taken by position. */
  readonly position?: number;
  /** The option's attribute in commander's parsed options, for a flag. */
  readonly attribute?: string;
}

/** The fields of an operation's input, in the order its schema declares them. */
function fieldsOf(operation: Operation): Field[] {
  // The root may itself be a reference into its own definitions: its fields
  // are read where it points, and every reference resolves against the whole.
  const whole = inputSchemaOf(operation);
  const root = resolved(whole, whole) ?? whole;
  const properties = (root.properties ?? {}) as Record<string, Json>;
  const required = new Set((root.required ?? []) as string[]);
  const positional = operation.cli?.positional ?? [];
  return Object.entries(properties).map(([name, schema]) => {
    const position = positional.indexOf(name);
    return {
      name,
      schema: inlined(schema, whole),
      required: required.has(name),
      ...(position >= 0 ? { position } : { attribute: new Option(flagOf(name)).attributeName() }),
    };
  });
}

/**
 * A field's schema with its references followed against the input's root,
 * its array items' too: a field lifted out of the root no longer carries the
 * `$defs` a `#/$defs/...` item points at.
 */
function inlined(schema: Json, root: Json, followed: ReadonlySet<string> = new Set()): Json {
  // A reference already followed on this path is a recursive schema: it is
  // left as it is rather than followed again, so registering the command
  // never loops, and a value under it passes as typed for the schema to judge.
  const ref = typeof schema.$ref === "string" ? schema.$ref : undefined;
  if (ref && followed.has(ref)) return {};
  const own = resolved(schema, root) ?? schema;
  if (!own.items || typeof own.items !== "object") return own;
  return { ...own, items: inlined(own.items as Json, root, ref ? new Set([...followed, ref]) : followed) };
}

/** What the help says beside a field: its description, its values, its default. */
function helpOf(field: Field): string {
  const said = typeof field.schema.description === "string" ? field.schema.description : "";
  const values = Array.isArray(field.schema.enum) ? `one of: ${(field.schema.enum as unknown[]).map(String).join(", ")}` : undefined;
  const items = resolved(field.schema.items as Json | undefined, field.schema);
  const repeated = typeOf(field.schema) === "array" && field.position === undefined ? "repeat it for more than one" : undefined;
  const itemValues = Array.isArray(items?.enum) ? `each one of: ${(items.enum as unknown[]).map(String).join(", ")}` : undefined;
  const fallback = field.schema.default !== undefined && typeOf(field.schema) !== "boolean" ? `default: ${JSON.stringify(field.schema.default)}` : undefined;
  const required = field.required && field.position === undefined ? "required" : undefined;
  const notes = [values, itemValues, repeated, fallback, required].filter((one): one is string => one !== undefined);
  return notes.length > 0 ? `${said} (${notes.join("; ")})`.trim() : said;
}

/** The placeholder a flag's value is written as in the help. */
function placeholderOf(schema: Json): string {
  switch (typeOf(schema)) {
    case "number":
    case "integer":
      return "<number>";
    case "array":
      return placeholderOf(resolved(schema.items as Json | undefined, schema) ?? {});
    case "object":
      return "<json>";
    default:
      return "<value>";
  }
}

/**
 * The arguments and flags an operation takes, onto its command: each
 * positional field an argument in the order its binding names them, and
 * every other input field a flag, its description the help.
 */
export function declareInput(command: Command, operation: Operation): void {
  const fields = fieldsOf(operation);
  const positional = fields.filter((field) => field.position !== undefined).sort((a, b) => a.position! - b.position!);
  for (const field of positional) {
    const name = typeOf(field.schema) === "array" ? `${field.name}...` : field.name;
    command.argument(field.required ? `<${name}>` : `[${name}]`, helpOf(field));
  }
  for (const field of fields.filter((one) => one.position === undefined)) {
    const flag = flagOf(field.name);
    if (typeOf(field.schema) === "boolean") {
      // A bare flag says true and its `--no-` form says false, so both values
      // can be typed; left out, the field is the schema's to default.
      if (field.schema.default !== true) command.addOption(new Option(flag, helpOf(field)));
      command.addOption(new Option(`--no-${flag.slice(2)}`, field.schema.default === true ? helpOf(field) : `the opposite of ${flag}`));
      continue;
    }
    const option = new Option(`${flag} ${placeholderOf(field.schema)}`, helpOf(field));
    // An array repeats: every value typed is kept, in order.
    // Appended in place: copying the list on every value would make a
    // thousand repetitions cost a million copies before any validation.
    if (typeOf(field.schema) === "array") {
      option.argParser((value: string, previous: unknown) => {
        const values = Array.isArray(previous) ? (previous as string[]) : [];
        values.push(value);
        return values;
      });
    }
    command.addOption(option);
  }
}

/** The input assembled from argv, or the field that refused it and why. */
export type Assembled =
  | { readonly ok: true; readonly input: Record<string, unknown> }
  | { readonly ok: false; readonly field: string; readonly why: string };

/**
 * The operation's input, read from what was typed and parsed as each field's
 * schema says: a number is parsed, a boolean is a bare flag, an array is
 * every value repeated, an enum is one of its values. A value its type
 * refuses names the flag and why; everything else is the schema's to judge.
 */
export function assembleInput(operation: Operation, args: readonly unknown[], options: Readonly<Record<string, unknown>>): Assembled {
  const input: Record<string, unknown> = {};
  for (const field of fieldsOf(operation)) {
    const raw = field.position !== undefined ? args[field.position] : options[field.attribute!];
    if (raw === undefined) continue;
    const parsed = parse(field.schema, raw);
    if (!parsed.ok) return { ok: false, field: field.name, why: parsed.why };
    input[field.name] = parsed.value;
  }
  return { ok: true, input };
}

type Parsed = { ok: true; value: unknown } | { ok: false; why: string };

/** One parser per type a field's schema names; a type with none passes as typed. */
const PARSERS: Readonly<Record<string, (schema: Json, raw: unknown) => Parsed>> = {
  number: (_schema, raw) => number(raw, false),
  integer: (_schema, raw) => number(raw, true),
  boolean: (_schema, raw) => boolean(raw),
  enum: (schema, raw) => oneOf(schema, raw),
  array: (schema, raw) => each(schema, raw),
  object: (_schema, raw) => json(raw),
};

function parse(schema: Json, raw: unknown): Parsed {
  const parser = PARSERS[typeOf(schema) ?? ""];
  return parser ? parser(schema, raw) : { ok: true, value: raw };
}

function number(raw: unknown, whole: boolean): Parsed {
  const typed = String(raw).trim();
  const value = typeof raw === "number" ? raw : Number(typed);
  if (typed === "" || !Number.isFinite(value)) return { ok: false, why: `takes a number, and \`${String(raw)}\` is not one` };
  if (whole && !Number.isInteger(value)) return { ok: false, why: `takes a whole number, and \`${String(raw)}\` is not one` };
  return { ok: true, value };
}

function boolean(raw: unknown): Parsed {
  if (typeof raw === "boolean") return { ok: true, value: raw };
  if (raw === "true" || raw === "false") return { ok: true, value: raw === "true" };
  return { ok: false, why: `takes true or false, and \`${String(raw)}\` is neither` };
}

function oneOf(schema: Json, raw: unknown): Parsed {
  const declared = schema.enum as unknown[];
  const values = declared.map(String);
  const at = values.indexOf(String(raw));
  if (at < 0) return { ok: false, why: `is one of ${values.join(", ")}, and \`${String(raw)}\` is not` };
  return { ok: true, value: declared[at] };
}

function each(schema: Json, raw: unknown): Parsed {
  const items = resolved(schema.items as Json | undefined, schema) ?? {};
  const values: unknown[] = [];
  for (const one of Array.isArray(raw) ? raw : [raw]) {
    const parsed = parse(items, one);
    if (!parsed.ok) return parsed;
    values.push(parsed.value);
  }
  return { ok: true, value: values };
}

function json(raw: unknown): Parsed {
  try {
    return { ok: true, value: typeof raw === "string" ? JSON.parse(raw) : raw };
  } catch {
    return { ok: false, why: "takes a JSON object, and what was typed does not parse" };
  }
}

/** The flags the command line keeps for itself on every operation's command. */
const RESERVED = new Set(["--json", "--no-json", "--help"]);

/**
 * Why an operation's input cannot be spelled on the command line, read before
 * its command is registered: an input whose fields sit in a composition it
 * cannot enumerate, or two fields, or a field and a flag the command keeps,
 * that would be typed as one flag.
 */
export function spellingProblems(operation: Operation): string[] {
  const whole = inputSchemaOf(operation);
  const root = resolved(whole, whole) ?? whole;
  const shape = shapeProblem(operation.id, root);
  if (shape) return [shape];
  const problems: string[] = [];
  const taken = new Map<string, string>();
  for (const field of fieldsOf(operation).filter((one) => one.position === undefined)) {
    const flag = flagOf(field.name);
    // Commander reads any `--no-` flag as the negation of what follows it, so
    // a boolean spelled that way could never be set true.
    if (typeOf(field.schema) === "boolean" && flag.startsWith("--no-")) {
      problems.push(`\`${operation.id}\` spells its boolean field \`${field.name}\` as \`${flag}\`, which the command line reads as a negation; name it for what it turns on`);
      continue;
    }
    const spellings = typeOf(field.schema) === "boolean" ? [flag, `--no-${flag.slice(2)}`] : [flag];
    for (const spelling of spellings) {
      const held = RESERVED.has(spelling) ? "the command line itself" : taken.get(spelling);
      if (held) problems.push(`\`${operation.id}\` spells its field \`${field.name}\` as \`${spelling}\`, which ${RESERVED.has(spelling) ? held : `its field \`${held}\``} already takes`);
      else taken.set(spelling, field.name);
    }
  }
  return problems;
}

/**
 * Why an input's shape has no fields to spell: one composed with allOf,
 * anyOf or oneOf, or one that is not an object at all — an array, a string —
 * which would leave a command that can never be given its input.
 */
function shapeProblem(id: string, root: Json): string | undefined {
  if (root.properties !== undefined) return undefined;
  if (["allOf", "anyOf", "oneOf"].some((key) => Array.isArray(root[key]))) {
    return `\`${id}\` takes an input composed with allOf, anyOf or oneOf, which the command line cannot spell; declare its fields on one object`;
  }
  if (typeOf(root) !== "object") return `\`${id}\` takes an input that is not an object, which the command line cannot spell; declare its input as an object of fields`;
  return undefined;
}

/** How a field is typed on this operation's command line: `<text>` or `--repo`. */
export function spelledAs(operation: Operation, field: string): string {
  const position = (operation.cli?.positional ?? []).indexOf(field);
  return position >= 0 ? `<${field}>` : flagOf(field);
}

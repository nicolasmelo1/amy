import { isJson, type Json } from "./json.js";

/**
 * Every primitive a view may use, and nothing else.
 *
 * Semantic rather than visual: `StateMachine` says what the thing is, so a
 * terminal can draw it as a line and a browser as a graph. Short on purpose,
 * for the reason the config schema has five types — every name here is one
 * every renderer has to draw.
 */
export const PRIMITIVES = [
  "Stack",
  "Row",
  "Section",
  "Text",
  "Badge",
  "List",
  "Table",
  "Tabs",
  "Button",
  "Link",
  "Input",
  "Timeline",
  "StateMachine",
  "Log",
  "Code",
  "Diff",
  "Empty",
] as const;

export type Primitive = (typeof PRIMITIVES)[number];

/** The kinds of value a property may hold. Each one is JSON, and has a schema. */
export type PropType =
  | "string"
  | "number"
  | "boolean"
  | "tone"
  | "strings"
  | "intent"
  | "columns"
  | "rows"
  | "entries"
  | "transitions";

export interface PropSpec {
  readonly type: PropType;
  readonly required?: true;
}

/** What a primitive holds inside it: nothing, text only, or other primitives. */
export type ChildrenKind = "none" | "text" | "nodes";

export interface PrimitiveSpec {
  readonly props: Readonly<Record<string, PropSpec>>;
  readonly children: ChildrenKind;
}

/** How loudly a renderer should draw something. The meaning is the renderer's. */
export const TONES = ["neutral", "muted", "success", "warning", "danger"] as const;

const optional = (type: PropType): PropSpec => ({ type });
const required = (type: PropType): PropSpec => ({ type, required: true });

export const VOCABULARY: Readonly<Record<Primitive, PrimitiveSpec>> = {
  Stack: { props: { gap: optional("number") }, children: "nodes" },
  Row: { props: { gap: optional("number") }, children: "nodes" },
  Section: { props: { title: optional("string") }, children: "nodes" },
  Text: { props: { tone: optional("tone") }, children: "text" },
  Badge: { props: { tone: optional("tone") }, children: "text" },
  List: { props: { ordered: optional("boolean") }, children: "nodes" },
  Table: { props: { columns: required("columns"), rows: required("rows") }, children: "none" },
  Tabs: { props: {}, children: "nodes" },
  Button: { props: { intent: required("intent") }, children: "text" },
  Link: { props: { href: required("string") }, children: "text" },
  Input: {
    props: { name: required("string"), value: optional("string"), placeholder: optional("string"), intent: optional("intent") },
    children: "none",
  },
  Timeline: { props: { entries: required("entries") }, children: "none" },
  StateMachine: {
    props: { states: required("strings"), current: optional("string"), transitions: optional("transitions") },
    children: "none",
  },
  Log: { props: { lines: required("strings") }, children: "none" },
  Code: { props: { language: optional("string") }, children: "text" },
  Diff: { props: {}, children: "text" },
  Empty: { props: {}, children: "text" },
};

type Record_ = { readonly [key: string]: Json };

const isRecord = (value: Json): value is Record_ => typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isStrings = (value: Json): boolean => Array.isArray(value) && value.every(isString);
const listOf = (value: Json, each: (item: Record_) => boolean): boolean =>
  Array.isArray(value) && value.every((item: Json) => isRecord(item) && each(item));
const optionalOf = (value: Json | undefined, check: (value: Json) => boolean): boolean => value === undefined || check(value);
const keysWithin = (item: Record_, allowed: readonly string[]): boolean => Object.keys(item).every((key) => allowed.includes(key));

/** Whether a value is an intent: an action named, with JSON arguments. */
export function isIntent(value: Json): boolean {
  return isRecord(value) && keysWithin(value, ["action", "args"]) && isString(value.action) && isRecord(value.args ?? null);
}

const CHECKS: Readonly<Record<PropType, (value: Json) => boolean>> = {
  string: isString,
  number: (value) => typeof value === "number",
  boolean: (value) => typeof value === "boolean",
  tone: (value) => isString(value) && (TONES as readonly string[]).includes(value),
  strings: isStrings,
  intent: isIntent,
  columns: (value) =>
    listOf(value, (column) =>
      keysWithin(column, ["label", "width", "optional"]) &&
      optionalOf(column.label, isString) &&
      optionalOf(column.width, (width) => typeof width === "number" && Number.isInteger(width) && width >= 0) &&
      optionalOf(column.optional, (flag) => typeof flag === "boolean")),
  rows: (value) => Array.isArray(value) && value.every(isStrings),
  entries: (value) => listOf(value, (entry) => keysWithin(entry, ["at", "label"]) && isString(entry.at) && isString(entry.label)),
  transitions: (value) => listOf(value, (edge) => keysWithin(edge, ["from", "to"]) && isString(edge.from) && isString(edge.to)),
};

/** Whether a value is one a property of this type may hold. */
export function fitsPropType(type: PropType, value: unknown): boolean {
  return isJson(value) && CHECKS[type](value);
}

const STRING = { type: "string" } as const;
const STRINGS = { type: "array", items: STRING } as const;
const closed = (properties: Record<string, Json>, requiredKeys: readonly string[]): Json => ({
  type: "object",
  properties,
  required: [...requiredKeys],
  additionalProperties: false,
});

/** The JSON Schema of each property type, which is what a catalogue publishes. */
export const PROP_SCHEMAS: Readonly<Record<PropType, Json>> = {
  string: STRING,
  number: { type: "number" },
  boolean: { type: "boolean" },
  tone: { type: "string", enum: [...TONES] },
  strings: STRINGS,
  intent: closed({ action: STRING, args: { type: "object" } }, ["action", "args"]),
  columns: {
    type: "array",
    items: closed({ label: STRING, width: { type: "integer", minimum: 0 }, optional: { type: "boolean" } }, []),
  },
  rows: { type: "array", items: STRINGS },
  entries: { type: "array", items: closed({ at: STRING, label: STRING }, ["at", "label"]) },
  transitions: { type: "array", items: closed({ from: STRING, to: STRING }, ["from", "to"]) },
};

/** One component of a catalogue: a primitive's name, its props as JSON Schema, and what it holds. */
export interface CatalogueComponent {
  readonly name: Primitive;
  readonly props: Json;
  readonly children: ChildrenKind;
}

/**
 * The vocabulary as a component catalogue, one component per primitive.
 *
 * What a later plugin hands to a declarative UI standard once one settles:
 * every property is described by JSON Schema alone, so nothing here needs a
 * feature such a catalogue cannot express.
 */
export function catalogue(): readonly CatalogueComponent[] {
  return PRIMITIVES.map((name) => {
    const spec = VOCABULARY[name];
    const entries = Object.entries(spec.props);
    return {
      name,
      props: closed(
        Object.fromEntries(entries.map(([key, prop]) => [key, PROP_SCHEMAS[prop.type]])),
        entries.filter(([, prop]) => prop.required).map(([key]) => key),
      ),
      children: spec.children,
    };
  });
}

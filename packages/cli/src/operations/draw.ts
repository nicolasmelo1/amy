import { Json, labelOf, resolved } from "./schema.js";

/**
 * An operation's output, drawn for a person from the output and its schema
 * alone: an object as labelled fields, an array of objects as a table, an
 * enum's values coloured, each field labelled by its title or description.
 *
 * No operation draws itself. One renderer for every output is what keeps a
 * plugin's command looking like amy's, and what keeps a plugin from writing
 * to the terminal at all.
 */
export function draw(value: unknown, schema: Json | undefined, color: boolean): string[] {
  const root = schema;
  const at = resolved(schema, root);
  if (Array.isArray(value)) return drawArray(value, at, root, color, "");
  if (isRecord(value)) return drawFields(value, at, root, color, "");
  return [scalar(value, at, color)];
}

/** One event of a stream, drawn as its name and then its data. */
export function drawEvent(event: string, data: unknown, schema: Json | undefined, color: boolean): string[] {
  const drawn = draw(data, schema, color);
  if (drawn.length === 1) return [`${paint(event, BOLD, color)}  ${drawn[0]}`];
  return [paint(event, BOLD, color), ...drawn.map((line) => `  ${line}`)];
}

const BOLD = "1";
const PALETTE = ["32", "33", "36", "35", "34", "31"];

function paint(text: string, code: string, color: boolean): string {
  return color ? `\u001b[${code}m${text}\u001b[0m` : text;
}

function visible(text: string): number {
  // eslint-disable-next-line no-control-regex -- an ANSI escape is a control character, and measuring a cell has to skip it
  return text.replace(/\u001b\[[0-9;]*m/g, "").length;
}

function pad(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - visible(text)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A value with no structure of its own, as it reads in a field or a cell. */
function scalar(value: unknown, schema: Json | undefined, color: boolean): string {
  if (value === undefined || value === null) return "—";
  if (Array.isArray(schema?.enum)) {
    const index = (schema.enum as unknown[]).indexOf(value);
    return paint(String(value), PALETTE[Math.max(0, index) % PALETTE.length]!, color);
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "(none)";
    const items = resolved(schema?.items as Json | undefined, schema);
    return value.map((one) => scalar(one, items, color)).join(", ");
  }
  return JSON.stringify(value);
}

/** The fields of a property, in the order its schema declares them, then any it does not. */
function keysOf(value: Record<string, unknown>, schema: Json | undefined): string[] {
  const declared = Object.keys((schema?.properties ?? {}) as Json);
  return [...declared, ...Object.keys(value).filter((key) => !declared.includes(key))];
}

function propertyOf(schema: Json | undefined, key: string, root: Json | undefined): Json | undefined {
  const properties = (schema?.properties ?? {}) as Record<string, Json>;
  return resolved(properties[key], root);
}

/** Whether a value is drawn as a block of its own rather than on its label's line. */
function isBlock(value: unknown): boolean {
  return isRecord(value) || (Array.isArray(value) && value.length > 0 && value.every(isRecord));
}

function drawFields(value: Record<string, unknown>, schema: Json | undefined, root: Json | undefined, color: boolean, indent: string): string[] {
  const keys = keysOf(value, schema).filter((key) => value[key] !== undefined);
  const width = Math.max(0, ...keys.filter((key) => !isBlock(value[key])).map((key) => labelOf(key, propertyOf(schema, key, root)).length));
  const lines: string[] = [];
  for (const key of keys) {
    const field = propertyOf(schema, key, root);
    const label = labelOf(key, field);
    const one = value[key];
    if (isRecord(one)) {
      lines.push(`${indent}${paint(label, BOLD, color)}`, ...drawFields(one, field, root, color, `${indent}  `));
    } else if (isBlock(one)) {
      lines.push(`${indent}${paint(label, BOLD, color)}`, ...drawArray(one as unknown[], field, root, color, `${indent}  `));
    } else {
      lines.push(`${indent}${pad(label, width)}  ${scalar(one, field, color)}`.trimEnd());
    }
  }
  return lines;
}

function drawArray(value: readonly unknown[], schema: Json | undefined, root: Json | undefined, color: boolean, indent: string): string[] {
  const items = resolved(schema?.items as Json | undefined, root);
  if (value.length === 0) return [`${indent}(none)`];
  if (!value.every(isRecord)) return value.map((one) => `${indent}${scalar(one, items, color)}`);
  return table(value as Record<string, unknown>[], items, root, color, indent);
}

/** Rows of objects as a table: one column per field any row carries, headed by its label. */
function table(rows: readonly Record<string, unknown>[], schema: Json | undefined, root: Json | undefined, color: boolean, indent: string): string[] {
  const keys = keysOf(Object.assign({}, ...rows) as Record<string, unknown>, schema).filter((key) => rows.some((row) => row[key] !== undefined));
  const headers = keys.map((key) => paint(labelOf(key, propertyOf(schema, key, root)), BOLD, color));
  const cells = rows.map((row) => keys.map((key) => scalar(row[key], propertyOf(schema, key, root), color)));
  const widths = keys.map((_, column) => Math.max(visible(headers[column]!), ...cells.map((row) => visible(row[column]!))));
  const line = (row: readonly string[]): string => `${indent}${row.map((cell, column) => pad(cell, widths[column]!)).join("  ")}`.trimEnd();
  return [line(headers), ...cells.map(line)];
}

/** Whether this process may colour what it draws. */
export function mayColor(stream: { isTTY?: boolean }): boolean {
  return stream.isTTY === true && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
}

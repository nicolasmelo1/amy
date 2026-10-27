import type { Json } from "./json.js";
import type { Child, Node } from "./tree.js";
import type { Primitive } from "./vocabulary.js";

/**
 * The text renderer: a tree in, the text a terminal prints out.
 *
 * Deterministic on purpose — no clock, no width, no colour — so the same tree
 * is the same bytes every time, which is what makes it the snapshot a test
 * asserts and the first renderer a conformance script measures.
 */
export function renderText(tree: Child): string {
  return typeof tree === "string" ? tree : DRAW[tree.type](tree);
}

type Props = Node["props"];
type Draw = (node: Node) => string;

const text = (node: Node): string => node.children.map(renderText).join("");
const string = (props: Props, key: string): string | undefined => {
  const value = props[key];
  return typeof value === "string" ? value : undefined;
};
const number = (props: Props, key: string, otherwise: number): number => {
  const value = props[key];
  return typeof value === "number" ? value : otherwise;
};
const records = (props: Props, key: string): readonly { readonly [key: string]: Json }[] =>
  (props[key] ?? []) as readonly { readonly [key: string]: Json }[];

/** A child of a list, its first line after the marker and the rest under it. */
function item(marker: string, child: Child): string {
  const indent = " ".repeat(marker.length);
  return renderText(child).split("\n").map((line, i) => (i === 0 ? marker : indent) + line).join("\n");
}

interface Column {
  readonly label?: string;
  readonly width?: number;
  readonly optional?: boolean;
}

/**
 * One line of a table: each cell padded to its column's width, one space
 * between them. From the first optional column on, nothing is padded past
 * the last word, so a row that left those blank ends where its required
 * columns do — separator included, which is what keeps it in line.
 */
function tableLine(columns: readonly Column[], cells: readonly string[]): string {
  const padded = columns.map((column, i) => {
    const cell = cells[i] ?? "";
    return column.width === undefined ? cell : cell.padEnd(column.width);
  });
  const firstOptional = columns.findIndex((column) => column.optional);
  if (firstOptional === -1) return padded.join(" ");
  const tail = padded.slice(firstOptional).join(" ").trimEnd();
  return firstOptional === 0 ? tail : `${padded.slice(0, firstOptional).join(" ")} ${tail}`;
}

function table(node: Node): string {
  const columns = records(node.props, "columns") as readonly Column[];
  const rows = (node.props.rows ?? []) as readonly (readonly string[])[];
  const header = columns.some((column) => column.label !== undefined)
    ? [tableLine(columns, columns.map((column) => column.label ?? ""))]
    : [];
  return [...header, ...rows.map((row) => tableLine(columns, row))].join("\n");
}

function stateMachine(node: Node): string {
  const current = string(node.props, "current");
  const states = (node.props.states ?? []) as readonly string[];
  return states.map((state) => (state === current ? `[${state}]` : state)).join(" → ");
}

const DRAW: Readonly<Record<Primitive, Draw>> = {
  Stack: (node) => node.children.map(renderText).join("\n".repeat(number(node.props, "gap", 0) + 1)),
  Row: (node) => node.children.map(renderText).join(" ".repeat(number(node.props, "gap", 1))),
  Section: (node) => {
    const title = string(node.props, "title");
    return [...(title === undefined ? [] : [title]), ...node.children.map(renderText)].join("\n");
  },
  Text: text,
  Badge: (node) => `(${text(node)})`,
  List: (node) =>
    node.children.map((child, i) => item(node.props.ordered === true ? `${i + 1}. ` : "- ", child)).join("\n"),
  Table: table,
  Tabs: (node) => node.children.map(renderText).join("\n\n"),
  Button: (node) => `[${text(node)}]`,
  Link: (node) => {
    const href = string(node.props, "href") ?? "";
    const label = text(node);
    return label ? `${label} <${href}>` : href;
  },
  Input: (node) => {
    const value = string(node.props, "value");
    const placeholder = string(node.props, "placeholder");
    const shown = value ?? (placeholder === undefined ? "" : `<${placeholder}>`);
    return `${string(node.props, "name") ?? ""}: ${shown}`.trimEnd();
  },
  Timeline: (node) => records(node.props, "entries").map((entry) => `${String(entry.at)}  ${String(entry.label)}`).join("\n"),
  StateMachine: stateMachine,
  Log: (node) => ((node.props.lines ?? []) as readonly string[]).join("\n"),
  Code: text,
  Diff: text,
  Empty: text,
};

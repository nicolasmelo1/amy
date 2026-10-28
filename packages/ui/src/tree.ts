import { isPlainObject, jsonCopy, onlyWhatJsonSends, type Json } from "./json.js";
import { fitsPropType, PRIMITIVES, VOCABULARY, type Primitive } from "./vocabulary.js";

/**
 * One primitive in a view's tree.
 *
 * Plain data and nothing else, so a tree survives a socket, a file and a
 * phone, and a test compares it with `toEqual`.
 */
export interface Node {
  readonly type: Primitive;
  readonly props: { readonly [key: string]: Json };
  readonly children: readonly Child[];
}

export type Child = Node | string;

/**
 * What a button or an input asks amy to do: an action named, with arguments.
 *
 * Never a closure. A closure cannot cross a socket, and the thing that
 * performs the action is amy, not the renderer that drew the button.
 */
export interface Intent {
  readonly action: string;
  readonly args: { readonly [key: string]: Json };
}

/** What may appear between a primitive's tags: nested arrays, and holes a condition left. */
export type Children = Child | number | boolean | null | undefined | readonly Children[];

function refuse(at: string, said: string): never {
  throw new TypeError(`${at}: ${said}`);
}

function primitiveNamed(type: unknown, at: string): Primitive {
  if (typeof type === "string" && (PRIMITIVES as readonly string[]).includes(type)) return type as Primitive;
  return refuse(at, `${JSON.stringify(type)} is not a primitive. The vocabulary is ${PRIMITIVES.join(", ")}`);
}

/**
 * The props, checked against the primitive's spec, as a frozen copy of what
 * the check read: what a getter or a later mutation does to the original no
 * longer reaches the tree.
 */
function checkedProps(type: Primitive, props: Readonly<Record<string, unknown>>, at: string): Node["props"] {
  const spec = VOCABULARY[type].props;
  const copy: Record<string, Json> = {};
  for (const [key, value] of Object.entries(props)) {
    // Own keys only: `constructor` or `toString` would otherwise find a member of the spec object.
    const prop = Object.hasOwn(spec, key) ? spec[key] : undefined;
    if (!prop) return refuse(at, `${type} has no property \`${key}\``);
    const read = jsonCopy(value);
    if (read === undefined) return refuse(at, `${type}.${key} is not a JSON value`);
    if (!fitsPropType(prop.type, read)) return refuse(at, `${type}.${key} is not of type ${prop.type}`);
    copy[key] = read;
  }
  for (const [key, prop] of Object.entries(spec)) {
    if (prop.required && !Object.hasOwn(copy, key)) refuse(at, `${type} needs \`${key}\``);
  }
  if (type === "Table") checkRows(copy, at);
  return Object.freeze(copy);
}

/** A row may leave cells blank, but no cell may fall outside every column: no renderer would draw it. */
function checkRows(props: Readonly<Record<string, Json>>, at: string): void {
  const columns = (props.columns as readonly Json[]).length;
  (props.rows as readonly (readonly Json[])[]).forEach((row, i) => {
    if (row.length > columns) refuse(at, `Table row ${i} has ${row.length} cells for ${columns} columns`);
  });
}

function checkChildren(type: Primitive, children: readonly Child[], at: string): void {
  const kind = VOCABULARY[type].children;
  if (kind === "none" && children.length > 0) refuse(at, `${type} holds nothing`);
  if (kind === "text" && children.some((child) => typeof child !== "string")) refuse(at, `${type} holds text only`);
  if (type === "Tabs" && children.some((child) => typeof child === "string" || child.type !== "Section")) {
    refuse(at, "Tabs holds a Section per tab");
  }
}

/** `above` holds the lists being flattened, so a list that holds itself is refused, not recursed into forever. */
function flatten(children: Children, into: Child[], at: string, above: Set<object> = new Set()): Child[] {
  if (children === null || children === undefined || typeof children === "boolean") return into;
  if (typeof children === "number") into.push(String(children));
  else if (typeof children === "string" || !Array.isArray(children)) into.push(children as Child);
  else {
    if (above.has(children)) return refuse(at, "a list of children holds itself, which no tree can");
    above.add(children);
    for (const child of children as readonly Children[]) flatten(child, into, at, above);
    above.delete(children);
  }
  return into;
}

/**
 * Nodes this module built or checked, so a tree built tag by tag is checked
 * once, not once per level. Every one of them is frozen, so none can change
 * after it was checked.
 */
const checked = new WeakSet<Node>();

function remember(type: Primitive, props: Node["props"], children: Child[]): Node {
  const node: Node = Object.freeze({ type, props, children: Object.freeze(children) });
  checked.add(node);
  return node;
}

/** A child built anywhere but here — by hand, or parsed — is checked the way `validate` would check it. */
function trusted(child: Child, at: string): Child {
  return typeof child === "string" || checked.has(child) ? child : validateAt(child, at);
}

/**
 * One primitive, built and checked.
 *
 * Refuses a name outside the vocabulary, a property the primitive does not
 * declare, and any value that is not JSON — a function included — naming
 * the one it refused. A property set to `undefined` is left out, which is
 * how a view writes an optional one.
 */
export function element(type: string, props: Readonly<Record<string, unknown>> = {}, children: Children = []): Node {
  const primitive = primitiveNamed(type, "view");
  const defined = Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined));
  const read = checkedProps(primitive, defined, primitive);
  const flat = flatten(children, [], primitive).map((child, i) => trusted(child, `${primitive}/${i}`));
  checkChildren(primitive, flat, primitive);
  return remember(primitive, read, flat);
}

/** `above` holds the nodes between the root and here, so a node that holds itself is refused, not recursed into forever. */
function validateAt(value: unknown, at: string, above: Set<object> = new Set()): Child {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return refuse(at, "is not a primitive or text");
  if (above.has(value)) return refuse(at, "holds itself, which no tree can");
  if (!onlyWhatJsonSends(value)) return refuse(at, "carries a property JSON would not send");
  const { type, props, children, ...rest } = value as Record<string, unknown>;
  const extra = Object.keys(rest);
  if (extra.length > 0) refuse(at, `carries ${extra.map((key) => `\`${key}\``).join(", ")}, which no primitive has`);
  const primitive = primitiveNamed(type, at);
  if (!isPlainObject(props)) return refuse(at, `${primitive} has no props object`);
  // The container too: a hidden `toJSON` on it would send something else in its place.
  const container = jsonCopy(props);
  if (container === undefined) return refuse(at, `${primitive} props are not a JSON value`);
  if (!Array.isArray(children)) return refuse(at, `${primitive} has no children list`);
  const valid = checkedProps(primitive, container as Record<string, Json>, at);
  // Each slot read once by index: a hole is refused, and no iterator or getter answers twice.
  const list: Child[] = [];
  above.add(value);
  for (let i = 0; i < children.length; i++) list.push(validateAt(children[i], `${at}/${i}`, above));
  above.delete(value);
  checkChildren(primitive, list, at);
  return remember(primitive, valid, list);
}

/**
 * A tree that arrived as data — from a socket, a file, a plugin — checked
 * against the vocabulary before anything draws it.
 *
 * A renderer draws what this returns and nothing else, so a primitive the
 * vocabulary does not have is refused here, named, with where it was.
 */
export function validate(value: unknown): Node {
  const tree = validateAt(value, "root");
  if (typeof tree === "string") return refuse("root", "is text, not a primitive");
  return tree;
}

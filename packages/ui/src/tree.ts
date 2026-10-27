import { isJson, isPlainObject, type Json } from "./json.js";
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

function checkProps(type: Primitive, props: Readonly<Record<string, unknown>>, at: string): void {
  const spec = VOCABULARY[type].props;
  for (const [key, value] of Object.entries(props)) {
    const prop = spec[key];
    if (!prop) refuse(at, `${type} has no property \`${key}\``);
    if (!isJson(value)) refuse(at, `${type}.${key} is not a JSON value`);
    if (!fitsPropType(prop.type, value)) refuse(at, `${type}.${key} is not of type ${prop.type}`);
  }
  for (const [key, prop] of Object.entries(spec)) {
    if (prop.required && !(key in props)) refuse(at, `${type} needs \`${key}\``);
  }
}

function checkChildren(type: Primitive, children: readonly Child[], at: string): void {
  const kind = VOCABULARY[type].children;
  if (kind === "none" && children.length > 0) refuse(at, `${type} holds nothing`);
  if (kind === "text" && children.some((child) => typeof child !== "string")) refuse(at, `${type} holds text only`);
  if (type === "Tabs" && children.some((child) => typeof child === "string" || child.type !== "Section")) {
    refuse(at, "Tabs holds a Section per tab");
  }
}

function flatten(children: Children, into: Child[]): Child[] {
  if (children === null || children === undefined || typeof children === "boolean") return into;
  if (typeof children === "number") into.push(String(children));
  else if (typeof children === "string" || !Array.isArray(children)) into.push(children as Child);
  else for (const child of children as readonly Children[]) flatten(child, into);
  return into;
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
  checkProps(primitive, defined, primitive);
  const flat = flatten(children, []);
  checkChildren(primitive, flat, primitive);
  return { type: primitive, props: defined as Node["props"], children: flat };
}

function validateAt(value: unknown, at: string): Child {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return refuse(at, "is not a primitive or text");
  const { type, props, children, ...rest } = value as Record<string, unknown>;
  const extra = Object.keys(rest);
  if (extra.length > 0) refuse(at, `carries ${extra.map((key) => `\`${key}\``).join(", ")}, which no primitive has`);
  const primitive = primitiveNamed(type, at);
  if (!isPlainObject(props)) return refuse(at, `${primitive} has no props object`);
  if (!Array.isArray(children)) return refuse(at, `${primitive} has no children list`);
  checkProps(primitive, props, at);
  // Every slot, not `map`: a hole in the list would cross the wire as `null`.
  const checked = Array.from(children, (child: unknown, i) => validateAt(child, `${at}/${i}`));
  checkChildren(primitive, checked, at);
  return { type: primitive, props: props as Node["props"], children: checked };
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

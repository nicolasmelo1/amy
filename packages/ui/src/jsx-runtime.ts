import { element, type Children, type Node } from "./tree.js";

/**
 * JSX, without React.
 *
 * Set as a package's `jsxImportSource`, this is what the compiler calls for
 * every tag, and what it returns is a `Node`: data, not something mounted.
 * A tag names a primitive, or a function of its props that returns one —
 * which is how a view is split into smaller views.
 */
type Component<P> = (props: P) => Node;

export function jsx<P extends object>(type: Component<P> | string, props: P, _key?: string): Node {
  if (typeof type === "function") return type(props);
  // A lowercase tag reaches here as a string, and is refused by name: there
  // is no intrinsic element, only the vocabulary.
  const { children, ...rest } = props as P & { children?: Children };
  return element(type, rest, children);
}

/** What the compiler calls for a tag with several children. The same thing: children are flattened either way. */
export function jsxs<P extends object>(type: Component<P> | string, props: P, key?: string): Node {
  return jsx(type, props, key);
}

// The JSX namespace is how the compiler checks a tag; it is types only.
// eslint-disable-next-line @typescript-eslint/no-namespace -- the compiler reads JSX from a namespace, there is no other spelling
export namespace JSX {
  export type Element = Node;
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- no intrinsic elements: every tag is a primitive or a view
  export interface IntrinsicElements {}
  export interface ElementChildrenAttribute {
    children: object;
  }
}

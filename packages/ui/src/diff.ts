import { sameJson, type Json } from "./json.js";
import type { Child, Node } from "./tree.js";

/** Where a node is: the index of each child taken from the root down. */
export type Path = readonly number[];

/**
 * One change to a tree.
 *
 * Positional: a child is matched by its index, so a list that grows at the
 * end costs one `insert`, and one that changes in the middle costs the
 * children past the change. Patches apply in order, each to the tree the one
 * before it left.
 */
export type Patch =
  | { readonly op: "replace"; readonly path: Path; readonly node: Child }
  | { readonly op: "props"; readonly path: Path; readonly props: Node["props"] }
  | { readonly op: "insert"; readonly path: Path; readonly index: number; readonly node: Child }
  | { readonly op: "remove"; readonly path: Path; readonly index: number };

/** What changed from one tree to the next, so a renderer is sent that rather than the window again. */
export function diff(before: Child, after: Child, path: Path = []): Patch[] {
  if (typeof before === "string" || typeof after === "string" || before.type !== after.type) {
    return before === after ? [] : [{ op: "replace", path, node: after }];
  }

  const patches: Patch[] = sameJson(before.props, after.props) ? [] : [{ op: "props", path, props: after.props }];
  const shared = Math.min(before.children.length, after.children.length);
  for (let i = 0; i < shared; i++) {
    patches.push(...diff(before.children[i] as Child, after.children[i] as Child, [...path, i]));
  }
  for (let i = shared; i < after.children.length; i++) {
    patches.push({ op: "insert", path, index: i, node: after.children[i] as Child });
  }
  for (let i = before.children.length - 1; i >= shared; i--) patches.push({ op: "remove", path, index: i });
  return patches;
}

function nodeAt(tree: Child, path: Path): Node {
  if (typeof tree === "string") throw new TypeError(`no node at ${JSON.stringify(path)}: text holds no children`);
  return tree;
}

/** The tree with the node at `path` replaced by what `change` makes of it, every other node shared. */
function rewrite(tree: Child, path: Path, change: (node: Child) => Child): Child {
  if (path.length === 0) return change(tree);
  const node = nodeAt(tree, path);
  const [head, ...rest] = path as [number, ...number[]];
  if (head >= node.children.length) throw new TypeError(`no child ${head} under ${node.type}`);
  const children = node.children.map((child, i) => (i === head ? rewrite(child, rest, change) : child));
  return { ...node, children };
}

function applyOne(tree: Child, patch: Patch): Child {
  switch (patch.op) {
    case "replace":
      return rewrite(tree, patch.path, () => patch.node);
    case "props":
      return rewrite(tree, patch.path, (node) => ({ ...nodeAt(node, patch.path), props: patch.props as { readonly [key: string]: Json } }));
    case "insert":
      return rewrite(tree, patch.path, (node) => {
        const target = nodeAt(node, patch.path);
        return { ...target, children: [...target.children.slice(0, patch.index), patch.node, ...target.children.slice(patch.index)] };
      });
    case "remove":
      return rewrite(tree, patch.path, (node) => {
        const target = nodeAt(node, patch.path);
        return { ...target, children: target.children.filter((_, i) => i !== patch.index) };
      });
  }
}

/** The tree the patches describe, built from the one they were taken against. The tree passed in is not changed. */
export function patch(tree: Child, patches: readonly Patch[]): Child {
  return patches.reduce(applyOne, tree);
}

import type { Json, Node } from "@amykit/ui";
import { abbreviates, type Box, type Frame, type Laid, type LaidRegion, type LaidSurface, type Mode } from "@amykit/ui/frame";

/**
 * What the harness reads out of what a renderer laid out: per surface, the
 * regions in the frame's order with what each holds, and how every pair of
 * regions sits relative to each other. No box is kept, only relations, so a
 * pixel and a cell compare the same way and a font changes nothing.
 */
export interface ProjectedRegion {
  readonly name: string;
  readonly fullHeight: boolean;
  readonly holds: readonly { readonly name: string; readonly tree: Node }[];
}

export interface ProjectedSurface {
  readonly regions: readonly ProjectedRegion[];
  /** `a left-of b`, `a above b`, `a overlaps b`, for each pair in the frame's order. */
  readonly relations: readonly string[];
}

export interface Projection {
  readonly step: string;
  readonly mode: Mode;
  /** The sections nav 1 offers, in the order it offers them. */
  readonly sections: readonly string[];
  readonly surfaces: Readonly<Record<string, ProjectedSurface>>;
}

const leftOf = (a: Box, b: Box): boolean => a.x + a.width <= b.x;
const above = (a: Box, b: Box): boolean => a.y + a.height <= b.y;
const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Every relation that holds between two boxes, in a fixed order. */
export function relate(a: Box, b: Box): readonly string[] {
  const found: string[] = [];
  if (leftOf(a, b)) found.push("left-of");
  if (leftOf(b, a)) found.push("right-of");
  if (above(a, b)) found.push("above");
  if (above(b, a)) found.push("below");
  if (overlaps(a, b)) found.push("overlaps");
  return found;
}

function ordered(frame: Frame, regions: readonly LaidRegion[]): readonly LaidRegion[] {
  const at = (name: string): number => {
    const i = frame.regions.findIndex((region) => region.name === name);
    return i === -1 ? frame.regions.length : i;
  };
  return [...regions].sort((a, b) => at(a.name) - at(b.name) || a.name.localeCompare(b.name));
}

function projectSurface(frame: Frame, surface: LaidSurface): ProjectedSurface {
  const regions = ordered(frame, surface.regions);
  const relations = regions.flatMap((a, i) =>
    regions.slice(i + 1).flatMap((b) => relate(a.box, b.box).map((relation) => `${a.name} ${relation} ${b.name}`)),
  );
  return {
    regions: regions.map((region) => ({
      name: region.name,
      fullHeight: region.box.y === 0 && region.box.height === surface.size.height,
      holds: region.holds,
    })),
    relations,
  };
}

/** The sections a tree offers: each `section.select` intent's section, in order. */
function sectionsIn(tree: Node): readonly string[] {
  const own = tree.type === "Button" && isSelect(tree.props.intent) ? [String((tree.props.intent as { args: { section: Json } }).args.section)] : [];
  return [...own, ...tree.children.flatMap((child) => (typeof child === "string" ? [] : sectionsIn(child)))];
}

function isSelect(intent: Json | undefined): boolean {
  return isObject(intent) && intent.action === "section.select";
}

export function project(frame: Frame, step: string, mode: Mode, laid: Laid): Projection {
  const surfaces = Object.fromEntries(
    Object.entries(laid.surfaces)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, surface]) => [name, projectSurface(frame, surface)]),
  );
  const nav = frame.regions.find((region) => region.holds.includes("section"));
  const held = laid.surfaces.window?.regions.find((region) => region.name === nav?.name)?.holds.find((hold) => hold.name === "section");
  return { step, mode, sections: held === undefined ? [] : sectionsIn(held.tree), surfaces };
}

/**
 * Where two projections first differ, as a path and the two values, or
 * nothing when they are the same. A label a person reads — a primitive's text,
 * a title, a placeholder — compares equal to one the frame's abbreviation rule
 * could have shortened it to, either way round; every other string, an
 * intent's action and arguments included, compares exactly.
 */
export function firstDifference(frame: Frame, a: unknown, b: unknown, at = "", role?: Role): string | undefined {
  if (Array.isArray(a) && Array.isArray(b)) return named(a) && named(b) ? byName(frame, a, b, at) : byIndex(frame, a, b, at, role);
  if (isObject(a) && isObject(b)) return byKey(frame, a, b, at);
  return same(frame, a, b, role === "label") ? undefined : `${at}: ${JSON.stringify(a) ?? "missing"} ≠ ${JSON.stringify(b) ?? "missing"}`;
}

/** What a value is to the node holding it: a label shown as it is, or the list of a node's children. */
type Role = "label" | "children";

/** The properties a renderer shows as text, rather than acts on. */
const LABELS = ["title", "placeholder"];

/** Two leaves: equal, or two labels one of which the frame's rule abbreviates to the other. */
function same(frame: Frame, a: unknown, b: unknown, label: boolean): boolean {
  if (!label || typeof a !== "string" || typeof b !== "string") return a === b;
  return abbreviates(frame, a, b) || abbreviates(frame, b, a);
}

function byKey(frame: Frame, a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>, at: string): string | undefined {
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const role: Role | undefined = key === "children" ? "children" : LABELS.includes(key) ? "label" : undefined;
    const found = firstDifference(frame, a[key], b[key], `${at}/${key}`, role);
    if (found !== undefined) return found;
  }
  return undefined;
}

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type Named = Readonly<Record<string, unknown>> & { readonly name: string };

/** Regions and holds: a list whose items each carry a name, none twice. */
function named(list: readonly unknown[]): list is readonly Named[] {
  const names = list.map((item) => (isObject(item) && typeof item.name === "string" ? item.name : undefined));
  return names.every((name) => name !== undefined) && new Set(names).size === names.length;
}

const presence = (item: unknown): string => (item === undefined ? "missing" : "drawn");

/** Compared by name, so a region one renderer left out is named, rather than shifting every one after it. */
function byName(frame: Frame, a: readonly Named[], b: readonly Named[], at: string): string | undefined {
  const names = [...new Set([...a, ...b].map((item) => item.name))];
  for (const name of names) {
    const left = a.find((item) => item.name === name);
    const right = b.find((item) => item.name === name);
    if (left === undefined || right === undefined) return `${at}/${name}: ${presence(left)} ≠ ${presence(right)}`;
    const found = firstDifference(frame, left, right, `${at}/${name}`);
    if (found !== undefined) return found;
  }
  const order = (list: readonly Named[]): string => list.map((item) => item.name).join(", ");
  return order(a) === order(b) ? undefined : `${at}: [${order(a)}] ≠ [${order(b)}]`;
}

/** A node's text children are labels; the items of any other list are not. */
function byIndex(frame: Frame, a: readonly unknown[], b: readonly unknown[], at: string, role?: Role): string | undefined {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i >= a.length || i >= b.length) return `${at}/${i}: ${presence(a[i])} ≠ ${presence(b[i])}`;
    const found = firstDifference(frame, a[i], b[i], `${at}/${i}`, role === "children" ? "label" : undefined);
    if (found !== undefined) return found;
  }
  return undefined;
}

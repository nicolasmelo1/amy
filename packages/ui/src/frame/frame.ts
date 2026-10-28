import { PRIMITIVES, type Primitive } from "../vocabulary.js";

/**
 * Where a region sits, said relationally: never a pixel and never a cell, so a
 * desktop window and a terminal are measured the same way.
 */
export type Place = "left" | "top" | "below" | "right" | "overlay";

export interface Region {
  readonly name: string;
  readonly place: Place;
  /** The region this one is placed relative to; `right-column` is everything not placed `left`. */
  readonly of?: string;
  readonly fullHeight: boolean;
  /** Drawn only while toggled on. */
  readonly toggled: boolean;
  /** An overlay, drawn only while open. */
  readonly openedBy?: string;
  readonly holds: readonly string[];
}

export interface Slot {
  readonly name: string;
  readonly fixed: readonly string[];
  /** The plugin collection that adds to it. */
  readonly extendedBy: string;
}

export interface Surface {
  readonly name: string;
  /** The primitives it may draw, or every one. */
  readonly holds: readonly Primitive[];
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export type Mode = "normal" | "insert";

export interface Frame {
  readonly version: 1;
  /** In the order the file declares them, which is the order a projection lists them in. */
  readonly regions: readonly Region[];
  readonly sections: { readonly fixed: readonly string[]; readonly extendedBy: string };
  readonly actions: readonly string[];
  readonly keys: { readonly normal: Readonly<Record<string, string>>; readonly insert: Readonly<Record<string, string>>; readonly leader: string };
  /** Gesture, then what it lands on, then the action. */
  readonly mouse: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly surfaces: readonly Surface[];
  readonly slots: readonly Slot[];
  readonly narrowest: { readonly cells: Size; readonly px: Size };
  readonly abbreviate: { readonly marker: string; readonly keeps: number };
}

const PLACES: readonly Place[] = ["left", "top", "below", "right", "overlay"];

function refuse(at: string, said: string): never {
  throw new TypeError(`frame.yaml: ${at} ${said}`);
}

type Data = Readonly<Record<string, unknown>>;

const isData = (value: unknown): value is Data => typeof value === "object" && value !== null && !Array.isArray(value);

function data(value: unknown, at: string): Data {
  return isData(value) ? value : refuse(at, "is not a mapping");
}

function strings(value: unknown, at: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) refuse(at, "is not a list of names");
  return value as string[];
}

function text(value: unknown, at: string): string {
  return typeof value === "string" && value !== "" ? value : refuse(at, "is not a name");
}

function count(value: unknown, at: string): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : refuse(at, "is not a positive whole number");
}

function onlyKeys(value: Data, allowed: readonly string[], at: string): void {
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length > 0) refuse(at, `has ${extra.map((key) => `\`${key}\``).join(", ")}, which the frame does not declare`);
}

function region(name: string, value: unknown): Region {
  const at = `regions.${name}`;
  const spec = data(value, at);
  onlyKeys(spec, ["place", "of", "spans", "toggled", "opened-by", "holds"], at);
  const place = spec.place;
  if (typeof place !== "string" || !(PLACES as readonly string[]).includes(place)) refuse(`${at}.place`, `is not one of ${PLACES.join(", ")}`);
  if (spec.spans !== undefined && spec.spans !== "full-height") refuse(`${at}.spans`, "can only be full-height");
  if (spec.toggled !== undefined && typeof spec.toggled !== "boolean") refuse(`${at}.toggled`, "is not true or false");
  return {
    name,
    place: place as Place,
    ...(spec.of === undefined ? {} : { of: text(spec.of, `${at}.of`) }),
    fullHeight: spec.spans === "full-height",
    toggled: spec.toggled === true,
    ...(spec["opened-by"] === undefined ? {} : { openedBy: text(spec["opened-by"], `${at}.opened-by`) }),
    holds: strings(spec.holds, `${at}.holds`),
  };
}

function checkPlacements(regions: readonly Region[]): void {
  const names = regions.map((each) => each.name);
  for (const each of regions) {
    if (each.of !== undefined && each.of !== "right-column" && !names.includes(each.of)) {
      refuse(`regions.${each.name}.of`, `names ${each.of}, which is not a region`);
    }
    if (each.place !== "left" && each.place !== "overlay" && each.of === undefined) refuse(`regions.${each.name}`, `is ${each.place} of nothing`);
  }
}

function keymap(value: unknown, actions: readonly string[], at: string): Readonly<Record<string, string>> {
  const map = data(value, at);
  for (const [key, action] of Object.entries(map)) {
    if (typeof action !== "string" || !actions.includes(action)) refuse(`${at}.${key}`, `is bound to ${String(action)}, which is not a declared action`);
  }
  return map as Record<string, string>;
}

function mouse(value: unknown, actions: readonly string[]): Frame["mouse"] {
  return Object.fromEntries(Object.entries(data(value, "mouse")).map(([gesture, targets]) => [gesture, keymap(targets, actions, `mouse.${gesture}`)]));
}

function surface(name: string, value: unknown): Surface {
  const at = `surfaces.${name}`;
  const spec = data(value, at);
  onlyKeys(spec, ["holds"], at);
  if (spec.holds === "all") return { name, holds: PRIMITIVES };
  const holds = strings(spec.holds, `${at}.holds`);
  const unknown = holds.find((each) => !(PRIMITIVES as readonly string[]).includes(each));
  if (unknown !== undefined) refuse(`${at}.holds`, `names ${unknown}, which is not a primitive`);
  return { name, holds: holds as Primitive[] };
}

function slot(name: string, value: unknown): Slot {
  const at = `slots.${name}`;
  const spec = data(value, at);
  onlyKeys(spec, ["fixed", "extended-by"], at);
  return { name, fixed: spec.fixed === undefined ? [] : strings(spec.fixed, `${at}.fixed`), extendedBy: text(spec["extended-by"], `${at}.extended-by`) };
}

function size(value: unknown, at: string): Size {
  const spec = data(value, at);
  onlyKeys(spec, ["width", "height"], at);
  return { width: count(spec.width, `${at}.width`), height: count(spec.height, `${at}.height`) };
}

const TOP_LEVEL = ["version", "regions", "sections", "actions", "keys", "mouse", "surfaces", "slots", "narrowest", "abbreviate"];

/**
 * The frame, checked from what `frame.yaml` parses to: a placement relative to
 * a region that does not exist, a key bound to an action the frame does not
 * declare, or a key the file does not know is refused by name.
 *
 * It takes data rather than text so this package parses no YAML: whoever
 * reads the file — the conformance harness, the server — hands it here.
 */
export function checkFrame(value: unknown): Frame {
  const root = data(value, "the file");
  onlyKeys(root, TOP_LEVEL, "the file");
  if (root.version !== 1) refuse("version", "is not 1");
  const regions = Object.entries(data(root.regions, "regions")).map(([name, spec]) => region(name, spec));
  checkPlacements(regions);
  const sections = data(root.sections, "sections");
  const actions = strings(root.actions, "actions");
  const keys = data(root.keys, "keys");
  onlyKeys(keys, ["normal", "insert", "leader"], "keys");
  const narrowest = data(root.narrowest, "narrowest");
  const abbreviate = data(root.abbreviate, "abbreviate");
  return {
    version: 1,
    regions,
    sections: { fixed: strings(sections.fixed, "sections.fixed"), extendedBy: text(sections["extended-by"], "sections.extended-by") },
    actions,
    keys: {
      normal: keymap(keys.normal, actions, "keys.normal"),
      insert: keymap(keys.insert, actions, "keys.insert"),
      leader: text(keys.leader, "keys.leader"),
    },
    mouse: mouse(root.mouse, actions),
    surfaces: Object.entries(data(root.surfaces, "surfaces")).map(([name, spec]) => surface(name, spec)),
    slots: Object.entries(data(root.slots, "slots")).map(([name, spec]) => slot(name, spec)),
    narrowest: { cells: size(narrowest.cells, "narrowest.cells"), px: size(narrowest.px, "narrowest.px") },
    abbreviate: { marker: text(abbreviate.marker, "abbreviate.marker"), keeps: count(abbreviate.keeps, "abbreviate.keeps") },
  };
}

/**
 * Whether `shown` is `full`, or `full` shortened the one way the frame allows:
 * its first characters, at least `keeps` of them, followed by the marker.
 */
export function abbreviates(frame: Frame, shown: string, full: string): boolean {
  if (shown === full) return true;
  const { marker, keeps } = frame.abbreviate;
  if (!shown.endsWith(marker)) return false;
  const kept = shown.slice(0, -marker.length);
  return kept.length >= keeps && kept.length < full.length && full.startsWith(kept);
}

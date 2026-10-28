import type { Json, Node } from "@amykit/ui";
import type { Box, ConformanceRenderer, Frame, LaidRegion, LaidSurface, Region, Scene } from "@amykit/ui/frame";
import type { Projection } from "./projection.js";
import { CONTRIBUTIONS, sectionOrder, slotOf, tabOrder, type ConformanceConfig } from "./world.js";

/** Every assertion the conformance script makes, by the name a gate requires it under. */
export const ASSERTIONS = [
  "frame.every_region_sits_where_declared",
  "frame.no_region_is_invented",
  "frame.every_key_does_what_it_is_declared_to",
  "frame.renderers_agree_on_every_region",
  "frame.nothing_moved_since_it_was_approved",
  "frame.a_slot_takes_only_what_it_declares",
  "frame.the_fixed_sections_come_first",
  "frame.no_region_is_lost_at_the_narrowest_width",
  "frame.keys_remaps_and_the_mouse_agree",
  "frame.a_surface_is_drawn_only_where_declared",
  "frame.a_projection_is_deterministic",
] as const;

export type Assertion = (typeof ASSERTIONS)[number];

/** One way a renderer is not the window that was agreed, said where it was seen. */
export interface Finding {
  readonly assertion: Assertion;
  readonly renderer: string;
  readonly run?: string;
  readonly step?: string;
  readonly message: string;
}

/** What one step is checked against: the renderer, the step it was on, and what it was handed. */
export interface StepContext {
  readonly frame: Frame;
  readonly renderer: ConformanceRenderer;
  readonly run: string;
  readonly step: string;
  readonly narrowest: boolean;
  readonly scene: Scene;
  readonly config: ConformanceConfig;
}

type Say = (assertion: Assertion, message: string) => Finding;

const sayer = (context: StepContext): Say => (assertion, message) => ({
  assertion,
  renderer: context.renderer.name,
  run: context.run,
  step: context.step,
  message,
});

const leftOf = (a: Box, b: Box): boolean => a.x + a.width <= b.x;
const above = (a: Box, b: Box): boolean => a.y + a.height <= b.y;
const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const tiled = (region: Region): boolean => region.place !== "overlay";

/** Whether the frame wants a region drawn right now: always, or while toggled on or open. */
function wanted(region: Region, scene: Scene): boolean {
  return region.toggled || region.openedBy !== undefined ? scene.regions[region.name]?.open === true : true;
}

interface Placed {
  readonly region: Region;
  readonly box: Box;
}

/** Per place, the relations it promises against the other drawn regions, each one that fails said as a sentence. */
const PLACEMENT: Readonly<Record<Region["place"], (self: Placed, others: readonly Placed[], of: Placed | undefined) => readonly string[]>> = {
  left: (self, others) =>
    others.flatMap((other) => (leftOf(self.box, other.box) ? [] : [`is declared left, and is not left of ${other.region.name}`])),
  top: (self, others) =>
    others.flatMap((other) => {
      if (other.region.place === "left") return leftOf(other.box, self.box) ? [] : [`is declared at the top of the right column, and is not right of ${other.region.name}`];
      return above(self.box, other.box) ? [] : [`is declared at the top of the right column, and is not above ${other.region.name}`];
    }),
  below: (self, _others, of) => (of === undefined || above(of.box, self.box) ? [] : [`is declared below ${of.region.name}, and is not`]),
  right: (self, _others, of) => (of === undefined || leftOf(of.box, self.box) ? [] : [`is declared right of ${of.region.name}, and is not`]),
  overlay: (self, others) => (others.some((other) => overlaps(self.box, other.box)) ? [] : ["is declared an overlay, and covers nothing"]),
};

/** Each relation one region's placement promises that its box breaks. */
function promises(self: Placed, drawn: readonly Placed[], height: number): readonly string[] {
  const others = drawn.filter((other) => other.region.name !== self.region.name && tiled(other.region));
  const of = drawn.find((other) => other.region.name === self.region.of);
  const tall = !self.region.fullHeight || (self.box.y === 0 && self.box.height === height);
  return [...PLACEMENT[self.region.place](self, others, of), ...(tall ? [] : ["is declared to span the full height, and does not"])];
}

function checkHolds(region: Region, laid: LaidRegion, say: Say): Finding[] {
  const invented = laid.holds.filter((hold) => !region.holds.includes(hold.name));
  const names = laid.holds.map((hold) => hold.name).filter((name) => region.holds.includes(name));
  return [
    ...invented.map((hold) => say("frame.no_region_is_invented", `${region.name} holds ${hold.name}, which the frame does not declare`)),
    ...(names.join() === region.holds.join()
      ? []
      : [say("frame.every_region_sits_where_declared", `${region.name} holds [${names.join(", ")}]; the frame declares [${region.holds.join(", ")}]`)]),
  ];
}

/** One declared region, against whether it should be drawn now and where its placement says it sits. */
function checkRegion(context: StepContext, region: Region, drawn: readonly (Placed & { laid: LaidRegion })[], surface: LaidSurface, say: Say): Finding[] {
  const lost: Say = (assertion, message) => say(context.narrowest ? "frame.no_region_is_lost_at_the_narrowest_width" : assertion, message);
  const here = drawn.find((each) => each.region.name === region.name);
  const want = wanted(region, context.scene);
  if (here === undefined) return want ? [lost("frame.every_region_sits_where_declared", `${region.name} should be drawn now, and is not`)] : [];
  return [
    ...(want ? [] : [say("frame.every_region_sits_where_declared", `${region.name} is drawn while it is ${region.toggled ? "toggled off" : "closed"}`)]),
    ...(here.box.width > 0 && here.box.height > 0 ? [] : [lost("frame.every_region_sits_where_declared", `${region.name} is drawn with no room`)]),
    ...promises(here, drawn, surface.size.height).map((broken) => say("frame.every_region_sits_where_declared", `${region.name} ${broken}`)),
    ...checkHolds(region, here.laid, say),
  ];
}

/** The frame holds on one surface: every region drawn when it should be, none other, each where it is declared. */
function checkRegions(context: StepContext, surface: LaidSurface, say: Say): Finding[] {
  const { frame } = context;
  const invented = surface.regions
    .filter((laid) => !frame.regions.some((region) => region.name === laid.name))
    .map((laid) => say("frame.no_region_is_invented", `${laid.name} is drawn, and the frame declares no such region`));
  const drawn = frame.regions.flatMap((region) => {
    const laid = surface.regions.find((each) => each.name === region.name);
    return laid === undefined ? [] : [{ region, box: laid.box, laid }];
  });
  return [...invented, ...frame.regions.flatMap((region) => checkRegion(context, region, drawn, surface, say))];
}

/** Every exact text a tree carries: its text, its string properties, an intent's arguments. */
function texts(value: Json | Node, into: string[] = []): string[] {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const item of value as readonly Json[]) texts(item, into);
  else if (typeof value === "object" && value !== null) for (const item of Object.values(value)) texts(item as Json, into);
  return into;
}

function tabsIn(tree: Node): readonly string[] {
  const intent = tree.props.intent as { action?: Json; args?: { tab?: Json } } | undefined;
  const own = tree.type === "Button" && intent?.action === "tab.select" ? [String(intent.args?.tab)] : [];
  return [...own, ...tree.children.flatMap((child) => (typeof child === "string" ? [] : tabsIn(child)))];
}

/** Where a contribution is drawn outside the slot the frame gives its collection. */
function strays(context: StepContext, surface: LaidSurface, collection: string, mark: string, say: Say): Finding[] {
  const slot = slotOf(context.frame, collection);
  const where = slot === undefined ? "nowhere" : [slot.region, slot.hold].filter(Boolean).join("/");
  return surface.regions.flatMap((region) =>
    region.holds.flatMap((hold) => {
      if (!texts(hold.tree).includes(mark)) return [];
      const inSlot = slot !== undefined && slot.region === region.name && (slot.hold === undefined || slot.hold === hold.name);
      return inSlot ? [] : [say("frame.a_slot_takes_only_what_it_declares", `${collection}'s ${mark} is drawn in ${region.name}/${hold.name}; its slot is ${where}`)];
    }),
  );
}

/** A plugin's contribution is drawn in its slot and nowhere else; a plugin tab comes after the fixed tabs. */
function checkSlots(context: StepContext, surface: LaidSurface, say: Say): Finding[] {
  const findings = CONTRIBUTIONS.flatMap(({ collection, mark }) => strays(context, surface, collection, mark, say));
  const tabs = slotOf(context.frame, "ui-tab");
  const held = surface.regions.find((region) => region.name === tabs?.region)?.holds.find((hold) => hold.name === tabs?.hold);
  const order = held === undefined ? [] : tabsIn(held.tree);
  const declared = tabOrder(context.frame);
  if (held !== undefined && order.join() !== declared.join()) {
    findings.push(say("frame.a_slot_takes_only_what_it_declares", `canvas tabs are [${order.join(", ")}]; the frame declares [${declared.join(", ")}]`));
  }
  return findings;
}

/** A surface is drawn only where the renderer declared it, the frame names it, and with only the primitives it holds. */
function checkSurfaces(context: StepContext, surfaces: Readonly<Record<string, LaidSurface>>, say: Say): Finding[] {
  const findings: Finding[] = [];
  for (const declared of context.renderer.surfaces) {
    if (!context.frame.surfaces.some((surface) => surface.name === declared)) findings.push(say("frame.a_surface_is_drawn_only_where_declared", `declares ${declared}, which the frame does not name`));
  }
  for (const [name, laid] of Object.entries(surfaces)) {
    const surface = context.frame.surfaces.find((each) => each.name === name);
    if (!context.renderer.surfaces.includes(name) || surface === undefined) {
      findings.push(say("frame.a_surface_is_drawn_only_where_declared", `draws ${name}, which it does not declare`));
      continue;
    }
    for (const region of laid.regions) {
      for (const hold of region.holds) {
        const stray = primitives(hold.tree).find((type) => !(surface.holds as readonly string[]).includes(type));
        if (stray !== undefined) findings.push(say("frame.a_surface_is_drawn_only_where_declared", `${name} draws a ${stray}, which it does not hold`));
      }
    }
  }
  return findings;
}

const primitives = (tree: Node): readonly string[] => [tree.type, ...tree.children.flatMap((child) => (typeof child === "string" ? [] : primitives(child)))];

/** Every check that reads one step of one run on its own. */
export function checkStep(context: StepContext, surfaces: Readonly<Record<string, LaidSurface>>, projection: Projection): Finding[] {
  const say = sayer(context);
  const window = surfaces.window;
  const expected = sectionOrder(context.frame, context.config);
  return [
    ...checkSurfaces(context, surfaces, say),
    ...(window === undefined ? [say("frame.every_region_sits_where_declared", "draws no window")] : [...checkRegions(context, window, say), ...checkSlots(context, window, say)]),
    ...(projection.sections.join() === expected.join()
      ? []
      : [say("frame.the_fixed_sections_come_first", `nav 1 offers [${projection.sections.join(", ")}]; the frame and the config give [${expected.join(", ")}]`)]),
  ];
}

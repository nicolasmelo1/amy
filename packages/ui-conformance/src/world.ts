import { element, type Intent, type Json, type Node } from "@amykit/ui";
import type { Frame, Mode, Scene } from "@amykit/ui/frame";

/**
 * The conformance world: fixed records in fixed states across two profiles,
 * a fixed clock, a fixed log, and one plugin contributing one of each
 * collection. Nothing in it moves unless the script moves it.
 */
interface WorldRecord {
  readonly id: string;
  readonly profile: string;
  readonly state: string;
  readonly title: string;
}

const STATES = ["DISCOVERED", "IMPLEMENTING", "ESCALATED", "IN_REVIEW", "DONE"];

export const WORLD = {
  clock: "2026-10-28T12:00:00.000Z",
  profiles: ["work", "personal"],
  records: [
    { id: "AMY-101", profile: "work", state: "IMPLEMENTING", title: "Retry the flaky gate" },
    { id: "AMY-102", profile: "work", state: "ESCALATED", title: "Choose the reviewer" },
    { id: "AMY-201", profile: "personal", state: "IN_REVIEW", title: "Write the menu bar" },
    { id: "AMY-202", profile: "personal", state: "DONE", title: "Close the frame" },
  ] as readonly WorldRecord[],
  log: [
    "2026-10-28T11:58:00.000Z work.advanced AMY-101 DISCOVERED → IMPLEMENTING",
    "2026-10-28T11:59:00.000Z work.escalated AMY-102",
    "2026-10-28T12:00:00.000Z work.advanced AMY-201 IMPLEMENTING → IN_REVIEW",
  ],
  /** One plugin, one of each collection; each thing it adds is named so it can be found wherever a renderer put it. */
  plugin: {
    section: { id: "checks", label: "Checks" },
    tab: { id: "coverage", label: "Coverage" },
    decoration: "ci",
    action: { id: "rerun", label: "Rerun" },
    panel: "Notes",
  },
} as const;

/** The labels the fixed sections and tabs carry. */
const LABELS: Readonly<Record<string, string>> = {
  work: "Work",
  workflows: "Workflows",
  settings: "Settings",
  timeline: "Timeline",
  diff: "Diff",
};

/** What the harness remembers about the window between steps: what a server would. */
export interface WindowState {
  readonly cursor: number;
  readonly open?: string;
  readonly panel: boolean;
  readonly palette: boolean;
  readonly mode: Mode;
  readonly tab: string;
  readonly section: string;
  readonly thread: Readonly<Record<string, readonly string[]>>;
}

export const START: WindowState = { cursor: 0, panel: false, palette: false, mode: "normal", tab: "timeline", section: "work", thread: {} };

/** The conformance config: the order it gives the fixed sections, and the keys it remaps. */
export interface ConformanceConfig {
  readonly sections?: readonly string[];
}

export function sectionOrder(frame: Frame, config: ConformanceConfig): readonly string[] {
  return [...(config.sections ?? frame.sections.fixed), WORLD.plugin.section.id];
}

export function tabOrder(frame: Frame): readonly string[] {
  const tabs = frame.slots.find((slot) => slot.name === "canvas.tabs");
  return [...(tabs?.fixed ?? []), WORLD.plugin.tab.id];
}

const count = (intent: Intent): number => (typeof intent.args.count === "number" ? intent.args.count : 1);
const arg = (intent: Intent, key: string): string | undefined => {
  const value: Json | undefined = intent.args[key];
  return typeof value === "string" ? value : undefined;
};

function step(list: readonly string[], current: string, by: number): string {
  const at = list.indexOf(current);
  return list[Math.min(list.length - 1, Math.max(0, at + by))] ?? current;
}

function post(state: WindowState, kind: string): WindowState {
  if (state.open === undefined) return state;
  return { ...state, thread: { ...state.thread, [state.open]: [...(state.thread[state.open] ?? []), kind] } };
}

const last = WORLD.records.length - 1;
const clamp = (at: number): number => Math.min(last, Math.max(0, at));

type Reducer = (state: WindowState, intent: Intent, frame: Frame, config: ConformanceConfig) => WindowState;

const REDUCERS: Readonly<Record<string, Reducer>> = {
  "nav.next": (state, intent) => ({ ...state, cursor: clamp(state.cursor + count(intent)) }),
  "nav.prev": (state, intent) => ({ ...state, cursor: clamp(state.cursor - count(intent)) }),
  "nav.first": (state) => ({ ...state, cursor: 0 }),
  "nav.last": (state) => ({ ...state, cursor: last }),
  "item.open": (state, intent) => {
    const named = WORLD.records.findIndex((record) => record.id === arg(intent, "id"));
    const cursor = named === -1 ? state.cursor : named;
    return { ...state, cursor, open: WORLD.records[cursor]?.id };
  },
  "panel.toggle": (state) => ({ ...state, panel: !state.panel }),
  "palette.open": (state) => ({ ...state, palette: true }),
  "close-topmost": (state) => (state.palette ? { ...state, palette: false } : state),
  "mode.insert": (state) => ({ ...state, mode: "insert" }),
  "mode.normal": (state) => ({ ...state, mode: "normal" }),
  "thread.post-discussion": (state) => post(state, "discussion"),
  "thread.decide": (state) => post(state, "decision"),
  "tab.next": (state, intent, frame) => ({ ...state, tab: step(tabOrder(frame), state.tab, count(intent)) }),
  "tab.prev": (state, intent, frame) => ({ ...state, tab: step(tabOrder(frame), state.tab, -count(intent)) }),
  "tab.select": (state, intent) => ({ ...state, tab: arg(intent, "tab") ?? state.tab }),
  "section.next": (state, intent, frame, config) => ({ ...state, section: step(sectionOrder(frame, config), state.section, count(intent)) }),
  "section.prev": (state, intent, frame, config) => ({ ...state, section: step(sectionOrder(frame, config), state.section, -count(intent)) }),
  "section.select": (state, intent) => ({ ...state, section: arg(intent, "section") ?? state.section }),
};

/** The window after an intent, the way the server would apply it. An action with nothing to do here changes nothing. */
export function apply(state: WindowState, intent: Intent, frame: Frame, config: ConformanceConfig): WindowState {
  return REDUCERS[intent.action]?.(state, intent, frame, config) ?? state;
}

const button = (label: string, action: string, args: Record<string, Json>): Node => element("Button", { intent: { action, args } }, label);
const label = (id: string): string => LABELS[id] ?? (id === WORLD.plugin.section.id ? WORLD.plugin.section.label : WORLD.plugin.tab.label);

function row(record: WorldRecord, cursor: boolean): Node {
  return element("Row", {}, [
    element("Text", {}, cursor ? "▸" : " "),
    element("Text", {}, record.id),
    element("Badge", {}, record.state),
    element("Badge", { tone: "muted" }, WORLD.plugin.decoration),
  ]);
}

function list(state: WindowState): Node {
  return element(
    "Stack",
    {},
    WORLD.profiles.map((profile) =>
      element("Section", { title: profile }, [
        element(
          "List",
          {},
          WORLD.records.flatMap((record, i) => (record.profile === profile ? [row(record, i === state.cursor)] : [])),
        ),
      ]),
    ),
  );
}

function body(record: WorldRecord, tab: string): Node {
  if (tab === "timeline") return element("Timeline", { entries: [{ at: WORLD.clock, label: `${record.id} is ${record.state}` }] });
  if (tab === "diff") return element("Diff", {}, `--- a/${record.id}\n+++ b/${record.id}\n+${record.title}`);
  return element("Text", {}, `${WORLD.plugin.tab.label}: 87%`);
}

function thread(state: WindowState, record: WorldRecord | undefined): Node {
  if (record === undefined) return element("Empty", {}, "Nothing open");
  const posted = (state.thread[record.id] ?? []).map((kind) => element("Text", {}, `you posted a ${kind}`));
  return element("Stack", {}, [
    element("Text", {}, `amy: ${record.id} is ${record.state}`),
    ...posted,
    element("Input", { name: "composer", placeholder: "Discuss" }),
  ]);
}

function canvas(frame: Frame, state: WindowState, record: WorldRecord | undefined): Record<string, Node> {
  const tabs = element("Row", {}, tabOrder(frame).map((tab) => button(label(tab), "tab.select", { tab })));
  if (record === undefined) {
    const nothing = element("Empty", {}, "Nothing open");
    return { header: nothing, machine: nothing, tabs, body: nothing };
  }
  return {
    header: element("Row", {}, [element("Text", {}, record.id), element("Badge", {}, record.state), element("Text", {}, record.title)]),
    machine: element("StateMachine", { states: STATES, current: record.state }),
    tabs,
    body: body(record, state.tab),
  };
}

/** The window as the server would describe it: per region, a tree for each thing it holds. */
export function scene(frame: Frame, state: WindowState, config: ConformanceConfig): Scene {
  const record = WORLD.records.find((each) => each.id === state.open);
  const holds: Readonly<Record<string, Record<string, Node>>> = {
    nav2: {
      search: element("Input", { name: "search", placeholder: "Search work" }),
      list: list(state),
      groom: button("Groom", "groom", {}),
    },
    nav1: { section: element("Row", {}, sectionOrder(frame, config).map((section) => button(label(section), "section.select", { section }))) },
    canvas: canvas(frame, state, record),
    panel: {
      log: element("Log", { lines: [...WORLD.log] }),
      thread: thread(state, record),
      "plugin-panel": element("Section", { title: WORLD.plugin.panel }, [element("Text", {}, "Nothing noted")]),
    },
    palette: { ask: element("Input", { name: "ask", placeholder: "Ask amy" }) },
  };
  const open: Readonly<Record<string, boolean>> = { panel: state.panel, palette: state.palette };
  return {
    mode: state.mode,
    regions: Object.fromEntries(frame.regions.map((region) => [region.name, { open: open[region.name] ?? true, holds: holds[region.name] ?? {} }])),
  };
}

/** Each thing the plugin adds, by the collection it adds through and the one exact text that names it wherever it is drawn. */
export const CONTRIBUTIONS: readonly { readonly collection: string; readonly mark: string }[] = [
  { collection: "ui-nav", mark: WORLD.plugin.section.id },
  { collection: "ui-tab", mark: WORLD.plugin.tab.id },
  { collection: "ui-decoration", mark: WORLD.plugin.decoration },
  { collection: "ui-action", mark: WORLD.plugin.action.id },
  { collection: "ui-panel", mark: WORLD.plugin.panel },
];

/**
 * Where the frame lets a collection add: the slot that names it, as a region
 * and — when the slot's second half is something the region holds — that
 * hold. Plugin sections go where the region holding `section` is.
 */
export function slotOf(frame: Frame, collection: string): { readonly region: string; readonly hold?: string } | undefined {
  if (collection === frame.sections.extendedBy) {
    const region = frame.regions.find((each) => each.holds.includes("section"));
    return region === undefined ? undefined : { region: region.name, hold: "section" };
  }
  const slot = frame.slots.find((each) => each.extendedBy === collection);
  if (slot === undefined) return undefined;
  const [name, part] = slot.name.split(".");
  const region = frame.regions.find((each) => each.name === name);
  if (region === undefined) return undefined;
  return part !== undefined && region.holds.includes(part) ? { region: region.name, hold: part } : { region: region.name };
}

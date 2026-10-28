import type { Json } from "@amykit/ui";

/**
 * One thing a person does. Driven by keys, it is the action pressed through
 * whichever key the keymap binds to it; driven by the mouse, it is the
 * gesture, when the frame gives that action one, and the key otherwise.
 */
export interface Move {
  readonly action: string;
  readonly mouse?: { readonly gesture: string; readonly on: string; readonly args: { readonly [key: string]: Json } };
}

export interface Step {
  readonly name: string;
  readonly moves: readonly Move[];
  /** Resize to the narrowest window the frame allows, after the moves. */
  readonly narrowest?: true;
}

/**
 * The script every renderer is driven through, in order: start, select the
 * escalated record, open its menu and close it, toggle the panel, open the palette, press enter in the
 * thread, open the diff tab, and resize to the narrowest the frame allows.
 */
export const SCRIPT: readonly Step[] = [
  { name: "start", moves: [] },
  {
    name: "select the escalated record",
    moves: [{ action: "nav.next" }, { action: "item.open", mouse: { gesture: "click", on: "row", args: { id: "AMY-102" } } }],
  },
  { name: "open the row menu", moves: [{ action: "item.menu" }] },
  { name: "close the row menu", moves: [{ action: "close-topmost" }] },
  { name: "toggle the panel", moves: [{ action: "panel.toggle", mouse: { gesture: "click-edge", on: "panel", args: {} } }] },
  { name: "open the palette", moves: [{ action: "palette.open" }] },
  {
    name: "press enter in the thread",
    moves: [{ action: "close-topmost" }, { action: "mode.insert" }, { action: "thread.post-discussion" }],
  },
  {
    name: "open the diff tab",
    moves: [{ action: "mode.normal" }, { action: "tab.next", mouse: { gesture: "click", on: "tab", args: { tab: "diff" } } }],
  },
  { name: "resize to the narrowest width", moves: [], narrowest: true },
];

/** The three ways the script is driven. They must yield the same projections. */
export const RUNS = ["keys", "remapped keys", "mouse"] as const;
export type Run = (typeof RUNS)[number];

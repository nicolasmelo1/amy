import type { Frame, Mode, Size } from "./frame.js";
import type { KeyOverrides } from "./keymap.js";
import type { Json } from "../json.js";
import type { Intent, Node } from "../tree.js";

/**
 * What a renderer measures in: a desktop window lays out in pixels, a
 * terminal in cells. Boxes are only ever compared relationally, so the two
 * compare the same way.
 */
export type Unit = "px" | "cell";

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * What the harness, standing in for the server, hands a renderer: every
 * region of the frame with the tree for each thing it holds, and whether a
 * toggled region or an overlay is open. A renderer translates this and
 * decides nothing about it.
 */
export interface Scene {
  readonly mode: Mode;
  readonly regions: Readonly<Record<string, { readonly open: boolean; readonly holds: Readonly<Record<string, Node>> }>>;
}

/** One region as the renderer laid it out, read back from its own layout engine. */
export interface LaidRegion {
  readonly name: string;
  readonly box: Box;
  readonly holds: readonly { readonly name: string; readonly tree: Node }[];
}

export interface LaidSurface {
  readonly size: Size;
  readonly regions: readonly LaidRegion[];
}

/** Everything a renderer drew, per surface. */
export interface Laid {
  readonly surfaces: Readonly<Record<string, LaidSurface>>;
}

/** A mouse gesture on something drawn: a click on a row, a wheel over the list, a click on the panel's edge. */
export interface Pointer {
  readonly gesture: string;
  readonly on: string;
  readonly args: { readonly [key: string]: Json };
}

export interface Session {
  draw(scene: Scene): void;
  /** One key, in Neovim notation; what it made the renderer ask for. */
  press(key: string): readonly Intent[];
  pointer(gesture: Pointer): readonly Intent[];
  resize(size: Size): void;
  read(): Laid;
}

/**
 * A renderer as the conformance script drives it. It declares the surfaces
 * it draws, and is measured on exactly those.
 */
export interface ConformanceRenderer {
  readonly name: string;
  readonly unit: Unit;
  readonly surfaces: readonly string[];
  /** The window it opens at. */
  readonly size: Size;
  start(options: { readonly frame: Frame; readonly keys?: KeyOverrides }): Session;
}

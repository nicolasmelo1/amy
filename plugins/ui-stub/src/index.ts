import { element, type Child, type Intent, type Node } from "@amykit/ui";
import {
  buildKeymap,
  KeyReader,
  type Box,
  type ConformanceRenderer,
  type Frame,
  type KeyOverrides,
  type Laid,
  type LaidRegion,
  type Pointer,
  type Scene,
  type Session,
  type Size,
  type Unit,
} from "@amykit/ui/frame";

/**
 * A renderer that draws exactly the frame and nothing else: the regions
 * where the frame declares them, what the scene hands it and nothing it
 * decided, and every key and gesture as the frame's keymap reads it.
 *
 * It has no screen. Its layout engine is the arithmetic below, and what it
 * laid out is what `read()` returns, which is all the conformance harness
 * ever measures in any renderer.
 */
interface Stub {
  readonly name: string;
  readonly unit: Unit;
  readonly size: Size;
  /** The height of nav 1, in this renderer's unit. */
  readonly bar: number;
  /** Below this width, a section's label is abbreviated the way the frame allows. */
  readonly roomy: number;
}

function boxes(stub: Stub, size: Size, scene: Scene): Readonly<Record<string, Box>> {
  const { width, height } = size;
  const nav = Math.floor(width / 4);
  const panel = scene.regions.panel?.open === true ? Math.floor(width / 4) : 0;
  const canvas: Box = { x: nav, y: stub.bar, width: width - nav - panel, height: height - stub.bar };
  return {
    nav2: { x: 0, y: 0, width: nav, height },
    nav1: { x: nav, y: 0, width: width - nav, height: stub.bar },
    canvas,
    panel: { x: width - panel, y: stub.bar, width: panel, height: height - stub.bar },
    palette: {
      x: canvas.x + Math.floor(canvas.width / 4),
      y: canvas.y + Math.floor(canvas.height / 4),
      width: Math.floor(canvas.width / 2),
      height: Math.floor(canvas.height / 2),
    },
  };
}

/** A label shortened by the frame's own rule, never by this renderer's. */
function abbreviate(frame: Frame, label: string): string {
  const keep = frame.abbreviate.keeps + 1;
  return label.length > keep + 2 ? `${label.slice(0, keep)}${frame.abbreviate.marker}` : label;
}

function shorten(frame: Frame, tree: Node): Node {
  const children: Child[] = tree.children.map((child) =>
    typeof child === "string" ? (tree.type === "Button" ? abbreviate(frame, child) : child) : shorten(frame, child),
  );
  return element(tree.type, tree.props, children);
}

function lay(stub: Stub, frame: Frame, size: Size, scene: Scene): readonly LaidRegion[] {
  const at = boxes(stub, size, scene);
  return frame.regions.flatMap((region) => {
    const given = scene.regions[region.name];
    const box = at[region.name];
    if (given === undefined || box === undefined || !given.open) return [];
    const narrow = size.width < stub.roomy && region.holds.includes("section");
    const holds = region.holds.flatMap((name) => {
      const tree = given.holds[name];
      if (tree === undefined) return [];
      return [{ name, tree: narrow ? shorten(frame, tree) : tree }];
    });
    return [{ name: region.name, box, holds }];
  });
}

function session(stub: Stub, frame: Frame, keys: KeyOverrides | undefined): Session {
  const reader = new KeyReader(buildKeymap(frame, keys));
  let size = stub.size;
  let scene: Scene = { mode: "normal", regions: {} };
  return {
    draw(next) {
      scene = next;
    },
    press(key) {
      const read = reader.press(scene.mode, key);
      if (read.kind !== "action") return [];
      const args: Intent["args"] = read.count > 1 ? { count: read.count } : {};
      return [{ action: read.action, args }];
    },
    pointer(gesture: Pointer) {
      const action = frame.mouse[gesture.gesture]?.[gesture.on];
      return action === undefined ? [] : [{ action, args: gesture.args }];
    },
    resize(next) {
      size = next;
    },
    read(): Laid {
      return { surfaces: { window: { size, regions: lay(stub, frame, size, scene) } } };
    },
  };
}

function renderer(stub: Stub): ConformanceRenderer {
  return {
    name: stub.name,
    unit: stub.unit,
    surfaces: ["window"],
    size: stub.size,
    start: ({ frame, keys }) => session(stub, frame, keys),
  };
}

/** One in pixels, as a desktop window lays out; one in cells, as a terminal does, which abbreviates when it is narrow. */
export const renderers: readonly ConformanceRenderer[] = [
  renderer({ name: "stub-desktop", unit: "px", size: { width: 1280, height: 800 }, bar: 48, roomy: 0 }),
  renderer({ name: "stub-terminal", unit: "cell", size: { width: 120, height: 40 }, bar: 3, roomy: 100 }),
];

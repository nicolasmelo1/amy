import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { abbreviates, checkFrame } from "@amykit/ui/frame";

const source = fs.readFileSync(path.resolve(import.meta.dirname, "../frame.yaml"), "utf-8");
const parseFrame = (text: string) => checkFrame(YAML.parse(text));
const frame = parseFrame(source);

describe("the frame", () => {
  it("declares the five regions in the order a projection lists them", () => {
    expect(frame.regions.map((region) => [region.name, region.place, region.of ?? null])).toEqual([
      ["nav2", "left", null],
      ["nav1", "top", "right-column"],
      ["canvas", "below", "nav1"],
      ["panel", "right", "canvas"],
      ["palette", "overlay", null],
    ]);
    expect(frame.regions.find((region) => region.name === "nav2")?.fullHeight).toBe(true);
    expect(frame.regions.find((region) => region.name === "panel")?.toggled).toBe(true);
  });

  it("names surfaces, never renderers, and closes the menu bar to five primitives", () => {
    expect(frame.surfaces.map((surface) => surface.name)).toEqual(["window", "menubar"]);
    expect(frame.surfaces[1]?.holds).toEqual(["Text", "Badge", "List", "Link", "Button"]);
  });

  it("puts the fixed tabs first in canvas.tabs, and opens it to ui-tab", () => {
    expect(frame.slots.find((slot) => slot.name === "canvas.tabs")).toEqual({ name: "canvas.tabs", fixed: ["timeline", "diff"], extendedBy: "ui-tab" });
  });

  it("refuses a key it does not know", () => {
    expect(() => parseFrame(`${source}\ncolours: { danger: red }\n`)).toThrow("frame.yaml: the file has `colours`, which the frame does not declare");
  });

  it("refuses a placement relative to a region that does not exist", () => {
    expect(() => parseFrame(source.replace("of: nav1,", "of: nav3,"))).toThrow("frame.yaml: regions.canvas.of names nav3, which is not a region");
  });

  it("refuses a place it does not have", () => {
    expect(() => parseFrame(source.replace("place: left,", "place: centre,"))).toThrow("frame.yaml: regions.nav2.place is not one of");
  });

  it("refuses a default key bound to an action it does not declare", () => {
    expect(() => parseFrame(source.replace("j: nav.next", "j: nav.nxt"))).toThrow("frame.yaml: keys.normal.j is bound to nav.nxt, which is not a declared action");
  });

  it("refuses a mouse gesture bound to an action it does not declare", () => {
    expect(() => parseFrame(source.replace("row: item.open", "row: item.launch"))).toThrow("mouse.click.row is bound to item.launch");
  });

  it("refuses a surface holding a primitive the vocabulary does not have", () => {
    expect(() => parseFrame(source.replace("[Text, Badge, List, Link, Button]", "[Text, Icon]"))).toThrow("surfaces.menubar.holds names Icon, which is not a primitive");
  });
});

describe("a label is shortened only by the frame's rule", () => {
  it.each([
    ["Workflows", "Workflows", true],
    ["Work…", "Workflows", true],
    ["Wor…", "Workflows", true],
    ["Wo…", "Workflows", false],
    ["Wf", "Workflows", false],
    ["Work...", "Workflows", false],
    ["Settings…", "Settings", false],
  ])("%s for %s is %s", (shown, full, allowed) => {
    expect(abbreviates(frame, shown, full)).toBe(allowed);
  });
});

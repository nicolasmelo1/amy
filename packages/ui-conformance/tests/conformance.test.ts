import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { element, type Node } from "@amykit/ui";
import type { ConformanceRenderer, Laid, LaidSurface, Session } from "@amykit/ui/frame";
import { ASSERTIONS, conform, FILES, goldenText, loadConformance, loadFrame, loadGolden, type Assertion, type Report } from "@amykit/ui-conformance";
import { renderers as stubs } from "@amykit/plugin-ui-stub";

const repo = path.resolve(import.meta.dirname, "../../..");
const fixture = path.join(repo, ".software-factory/mutations/L1.EVERY_RENDERER_HOLDS_THE_FRAME");
const frame = loadFrame();
const config = loadConformance();
const golden = loadGolden();
const [desktop, terminal] = stubs as [ConformanceRenderer, ConformanceRenderer];

const failed = (report: Report): readonly Assertion[] => report.assertions.filter((each) => each.status === "failed").map((each) => each.type);
const messages = (report: Report, assertion: Assertion): readonly string[] =>
  report.findings.filter((finding) => finding.assertion === assertion).map((finding) => finding.message);

/** The desktop stub, with one thing about what it reads back changed. */
function altered(name: string, change: (session: Session) => Partial<Session>): ConformanceRenderer {
  return {
    ...desktop,
    name,
    start(options) {
      const session = desktop.start(options);
      return { ...session, ...change(session) };
    },
  };
}

function window(laid: Laid): LaidSurface {
  return laid.surfaces.window as LaidSurface;
}

function retree(laid: Laid, region: string, hold: string, tree: (old: Node) => Node): Laid {
  const surface = window(laid);
  return {
    surfaces: {
      ...laid.surfaces,
      window: {
        ...surface,
        regions: surface.regions.map((each) =>
          each.name !== region ? each : { ...each, holds: each.holds.map((held) => (held.name === hold ? { ...held, tree: tree(held.tree) } : held)) },
        ),
      },
    },
  };
}

async function fixtureRenderer(plugin: string): Promise<ConformanceRenderer> {
  const module = (await import(pathToFileURL(path.join(fixture, "plugins", plugin, "renderer.mjs")).href)) as { renderers: ConformanceRenderer[] };
  return module.renderers[0] as ConformanceRenderer;
}

describe("a stub renderer that draws exactly the frame", () => {
  const report = conform(frame, stubs, config, golden);

  it("passes every assertion, in pixels and in cells, three ways and twice", () => {
    expect(report.findings).toEqual([]);
    expect(report.assertions.map((each) => each.type)).toEqual([...ASSERTIONS]);
    expect(failed(report)).toEqual([]);
  });

  it("yields byte-identical projections when the script runs again", () => {
    expect(JSON.stringify(conform(frame, stubs, config, golden).projections)).toBe(JSON.stringify(report.projections));
  });

  it("is what the approved golden holds, byte for byte", () => {
    const first = report.projections[desktop.name] ?? [];
    expect(goldenText({ steps: first })).toBe(fs.readFileSync(FILES.golden, "utf-8"));
  });

  it("abbreviates in the terminal only by the frame's rule, and still agrees", () => {
    const narrow = report.projections[terminal.name]?.at(-1);
    const sections = narrow?.surfaces.window?.regions.find((region) => region.name === "nav1")?.holds[0]?.tree;
    expect(JSON.stringify(sections)).toContain("Work…");
    expect(failed(report)).not.toContain("frame.renderers_agree_on_every_region");
  });

  it("offers the fixed sections in the order the config gives, and the plugin's after", () => {
    expect(report.projections[desktop.name]?.[0]?.sections).toEqual(["workflows", "work", "settings", "checks"]);
  });
});

describe("the fixtures L1.EVERY_RENDERER_HOLDS_THE_FRAME trips on", () => {
  it("fails a renderer with nav 2 on the right, naming the region and the relation", async () => {
    const report = conform(frame, [await fixtureRenderer("ui-nav-on-the-right")], config, golden);

    expect(failed(report)).toContain("frame.every_region_sits_where_declared");
    expect(messages(report, "frame.every_region_sits_where_declared")).toContain("nav2 is declared left, and is not left of canvas");
  });

  it("fails a renderer that never draws the panel", async () => {
    const report = conform(frame, [await fixtureRenderer("ui-no-panel")], config, golden);

    expect(messages(report, "frame.every_region_sits_where_declared")).toContain("panel should be drawn now, and is not");
    expect(messages(report, "frame.no_region_is_lost_at_the_narrowest_width")).toContain("panel should be drawn now, and is not");
  });

  it("fails a renderer whose enter in the thread posts a decision", async () => {
    const report = conform(frame, [await fixtureRenderer("ui-enter-decides")], config, golden);

    expect(messages(report, "frame.every_key_does_what_it_is_declared_to")).toContain(
      "<CR> in insert mode did thread.decide; the frame declares thread.post-discussion",
    );
  });

  it("fails a renderer that puts the plugin's tab in nav 1", async () => {
    const report = conform(frame, [await fixtureRenderer("ui-tab-in-nav1")], config, golden);

    expect(messages(report, "frame.a_slot_takes_only_what_it_declares")).toEqual(
      expect.arrayContaining(["ui-tab's coverage is drawn in nav1/section; its slot is canvas/tabs", "canvas tabs are [timeline, diff]; the frame declares [timeline, diff, coverage]"]),
    );
  });
});

describe("each assertion fails the renderer that breaks it", () => {
  it("a region the frame does not declare", () => {
    const report = conform(
      frame,
      [
        altered("invents-a-region", (session) => ({
          read: () => {
            const laid = session.read();
            const surface = window(laid);
            return { surfaces: { window: { ...surface, regions: [...surface.regions, { name: "sidebar", box: { x: 0, y: 0, width: 1, height: 1 }, holds: [] }] } } };
          },
        })),
      ],
      config,
      golden,
    );

    expect(messages(report, "frame.no_region_is_invented")).toContain("sidebar is drawn, and the frame declares no such region");
  });

  it("a surface the renderer did not declare, or a primitive the surface does not hold", () => {
    const menubar: LaidSurface = { size: { width: 1, height: 1 }, regions: [{ name: "nav2", box: { x: 0, y: 0, width: 1, height: 1 }, holds: [{ name: "list", tree: element("Table", { columns: [], rows: [] }) }] }] };
    const undeclared = altered("draws-a-menu-bar", (session) => ({ read: () => ({ surfaces: { ...session.read().surfaces, menubar } }) }));
    const declared = { ...undeclared, name: "declares-a-menu-bar", surfaces: ["window", "menubar"] };

    expect(messages(conform(frame, [undeclared], config, golden), "frame.a_surface_is_drawn_only_where_declared")).toContain("draws menubar, which it does not declare");
    expect(messages(conform(frame, [declared], config, golden), "frame.a_surface_is_drawn_only_where_declared")).toContain("menubar draws a Table, which it does not hold");
  });

  it("two renderers whose canvas trees differ, naming the first node that differs", () => {
    const other = altered("another-header", (session) => ({
      read: () => retree(session.read(), "canvas", "header", (tree) => (tree.type === "Empty" ? tree : element("Row", {}, [element("Text", {}, "AMY-999")]))),
    }));
    const report = conform(frame, [desktop, other], config, golden);

    expect(messages(report, "frame.renderers_agree_on_every_region")[0]).toBe(
      'another-header and stub-desktop differ first at /surfaces/window/regions/canvas/holds/header/tree/children/0/children/0: "AMY-999" ≠ "AMY-102"',
    );
  });

  it("a projection that differs from the approved golden", () => {
    const moved = { steps: golden?.steps.map((step) => ({ ...step, sections: [...step.sections].reverse() })) ?? [] };
    expect(messages(conform(frame, [desktop], config, moved), "frame.nothing_moved_since_it_was_approved")[0]).toBe(
      'differs from the approved projection at /sections/0: "workflows" ≠ "checks"',
    );
    expect(messages(conform(frame, [desktop], config, undefined), "frame.nothing_moved_since_it_was_approved")).toEqual([
      "there is no approved projection to compare with",
    ]);
  });

  it("sections out of the order the config gives", () => {
    const report = conform(frame, [desktop], { ...config, sections: ["work", "workflows", "settings"] }, golden);
    expect(messages(report, "frame.the_fixed_sections_come_first")).toHaveLength(0);
    const shuffled = altered("plugin-section-first", (session) => ({
      read: () => retree(session.read(), "nav1", "section", (tree) => ({ ...tree, children: [...tree.children].reverse() })),
    }));
    expect(messages(conform(frame, [shuffled], config, golden), "frame.the_fixed_sections_come_first")[0]).toBe(
      "nav 1 offers [checks, settings, work, workflows]; the frame and the config give [workflows, work, settings, checks]",
    );
  });

  it("a region lost at the narrowest width", () => {
    const report = conform(
      frame,
      [
        altered("drops-the-canvas-when-narrow", (session) => {
          let narrow = false;
          return {
            resize(size) {
              narrow = true;
              session.resize(size);
            },
            read() {
              const laid = session.read();
              const surface = window(laid);
              return narrow ? { surfaces: { window: { ...surface, regions: surface.regions.filter((region) => region.name !== "canvas") } } } : laid;
            },
          };
        }),
      ],
      config,
      golden,
    );

    expect(messages(report, "frame.no_region_is_lost_at_the_narrowest_width")).toContain("canvas should be drawn now, and is not");
  });

  it("a mouse that does not reach the action its key does", () => {
    const report = conform(frame, [altered("deaf-to-the-mouse", () => ({ pointer: () => [] }))], config, golden);

    expect(messages(report, "frame.every_key_does_what_it_is_declared_to")).toContain("click on row did nothing; the frame declares item.open");
    expect(failed(report)).toContain("frame.keys_remaps_and_the_mouse_agree");
  });

  it("a remap the renderer ignores", () => {
    const report = conform(frame, [{ ...desktop, name: "ignores-remaps", start: (options) => desktop.start({ frame: options.frame }) }], config, golden);

    expect(messages(report, "frame.every_key_does_what_it_is_declared_to")).toContain("<C-n> in normal mode did nothing; the frame declares nav.next");
    expect(failed(report)).toContain("frame.keys_remaps_and_the_mouse_agree");
  });

  it("a renderer that draws something different the second time", () => {
    let runs = 0;
    const report = conform(
      frame,
      [
        altered("restless", (session) => {
          runs += 1;
          const run = runs;
          return { read: () => retree(session.read(), "nav2", "groom", () => element("Button", { intent: { action: "groom", args: {} } }, run > 3 ? "Groom again" : "Groom")) };
        }),
      ],
      config,
      golden,
    );

    expect(messages(report, "frame.a_projection_is_deterministic")[0]).toMatch(/^the same script twice: \/0\/surfaces\/window\/regions\/nav2\/holds\/groom/);
  });

  it("a renderer that cannot even start", () => {
    const report = conform(frame, [{ ...desktop, name: "broken", start: () => { throw new Error("no display"); } }], config, golden);

    expect(report.findings).toEqual([{ assertion: "frame.every_region_sits_where_declared", renderer: "broken", message: "could not be driven: no display" }]);
  });

  it("no renderer at all, which passes nothing", () => {
    expect(conform(frame, [], config, golden).assertions.every((each) => each.status === "failed")).toBe(true);
  });
});

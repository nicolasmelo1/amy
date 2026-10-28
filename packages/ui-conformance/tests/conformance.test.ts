import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { element, type Node } from "@amykit/ui";
import type { ConformanceRenderer, Laid, LaidSurface, Session } from "@amykit/ui/frame";
import { approve, ASSERTIONS, conform, FILES, goldenText, loadConformance, loadFrame, loadGolden, type Assertion, type Report } from "@amykit/ui-conformance";
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

  it("a layout slid wholly off the window, which keeps every relation", () => {
    const off = altered("off-screen", (session) => ({
      read() {
        const surface = window(session.read());
        return { surfaces: { window: { ...surface, regions: surface.regions.map((region) => ({ ...region, box: { ...region.box, x: region.box.x + surface.size.width } })) } } };
      },
    }));

    expect(messages(conform(frame, [off], config, golden), "frame.every_region_sits_where_declared")).toContain("nav2 is drawn outside the 1280×800 window");
  });

  it("a surface the renderer declares and never draws", () => {
    const report = conform(frame, [{ ...desktop, name: "promises-a-menu-bar", surfaces: ["window", "menubar"] }], config, golden);

    expect(messages(report, "frame.a_surface_is_drawn_only_where_declared")).toContain("declares menubar, and does not draw it");
  });

  it("a renderer of the menu bar alone, measured on the menu bar and nothing of the window", () => {
    const menubar: LaidSurface = { size: { width: 1, height: 1 }, regions: [] };
    const only = { ...altered("menu-bar-only", () => ({ read: () => ({ surfaces: { menubar } }) })), surfaces: ["menubar"] };
    const report = conform(frame, [only], config, golden);

    expect(report.findings).toEqual([]);
  });

  it("a menu bar beside the window, compared only on the surfaces the golden approved", () => {
    const menubar: LaidSurface = { size: { width: 1, height: 1 }, regions: [] };
    const both = { ...altered("window-and-menu-bar", (session) => ({ read: () => ({ surfaces: { ...session.read().surfaces, menubar } }) })), surfaces: ["window", "menubar"] };

    expect(messages(conform(frame, [both], config, golden), "frame.nothing_moved_since_it_was_approved")).toEqual([]);
  });

  it("a resize that does nothing, which cannot pass for the narrowest width", () => {
    const report = conform(frame, [altered("will-not-shrink", () => ({ resize: () => undefined }))], config, golden);

    expect(messages(report, "frame.no_region_is_lost_at_the_narrowest_width")).toContain("the window is 1280×800, not the narrowest 720×480 it was resized to");
  });

  it("an intent shortened as though it were a label", () => {
    const shortened = altered("gro…", (session) => ({
      read: () => retree(session.read(), "nav2", "groom", (tree) => element("Button", { intent: { action: "gro…", args: {} } }, ...tree.children)),
    }));

    expect(messages(conform(frame, [shortened], config, golden), "frame.nothing_moved_since_it_was_approved")[0]).toBe(
      'differs from the approved projection at /surfaces/window/regions/nav2/holds/groom/tree/props/intent/action: "gro…" ≠ "groom"',
    );
  });

  it("a row menu that leaves out the plugin's action", () => {
    const report = conform(
      frame,
      [
        altered("drops-plugin-actions", (session) => ({
          read: () =>
            retree(session.read(), "nav2", "list", function drop(tree: Node): Node {
              const children = tree.children.filter((child) => typeof child === "string" || (child.props.intent as { action?: string } | undefined)?.action !== "rerun");
              return { ...tree, children: children.map((child) => (typeof child === "string" ? child : drop(child))) };
            }),
        })),
      ],
      config,
      golden,
    );

    expect(messages(report, "frame.a_slot_takes_only_what_it_declares")).toContain("ui-action's rerun was handed to nav2, and is not drawn there");
  });

  it("a key the script never presses, a count, or a gesture it never makes", () => {
    const deaf = altered("ignores-k-counts-and-the-wheel", (session) => ({
      press: (key) => (key === "k" || /^[0-9]$/.test(key) ? [] : session.press(key)),
      pointer: (gesture) => (gesture.gesture === "wheel" ? [] : session.pointer(gesture)),
    }));
    const said = messages(conform(frame, [deaf], config, golden), "frame.every_key_does_what_it_is_declared_to");

    expect(said).toContain("k in normal mode, on its own, did nothing; the frame declares nav.prev");
    expect(said).toContain('3j in normal mode did nav.next; the frame declares nav.next {"count":3}');
    expect(said).toContain("wheel on list, on its own, did nothing; the frame declares nav.scroll");
  });

  it("two menu bars that differ, when the first renderer draws no menu bar at all", () => {
    const menubar = (label: string): LaidSurface => ({
      size: { width: 1, height: 1 },
      regions: [{ name: "nav2", box: { x: 0, y: 0, width: 1, height: 1 }, holds: [{ name: "list", tree: element("Text", {}, label) }] }],
    });
    const withMenu = (name: string, label: string): ConformanceRenderer => ({
      ...altered(name, (session) => ({ read: () => ({ surfaces: { ...session.read().surfaces, menubar: menubar(label) } }) })),
      surfaces: ["window", "menubar"],
    });
    const report = conform(frame, [{ ...desktop, name: "a-window" }, withMenu("b-menu", "1 waiting"), withMenu("c-menu", "2 waiting")], config, golden);

    expect(messages(report, "frame.renderers_agree_on_every_region")).toContain(
      'b-menu and c-menu differ first at /surfaces/menubar/regions/nav2/holds/list/tree/children/0: "1 waiting" ≠ "2 waiting"',
    );
  });

  // The command as built, which the gate and CI build before this suite runs.
  it("an approval that would write a broken window, refused with the golden untouched", () => {
    const before = fs.readFileSync(FILES.golden, "utf-8");
    const done = spawnSync(
      process.execPath,
      [path.join(repo, "packages/ui-conformance/dist/cli.js"), "--approve", "--renderer", path.join(fixture, "plugins/ui-no-panel/renderer.mjs")],
      { encoding: "utf-8" },
    );

    expect(done.status).toBe(1);
    expect(done.stderr).toContain("not approved, and");
    expect(fs.readFileSync(FILES.golden, "utf-8")).toBe(before);
  });

  it("not a binding that begins with 0, which takes no count and still works on its own", () => {
    const zero = { ...config, keys: { ...config.keys, normal: { ...config.keys.normal, "0": "nav.first" } } };

    expect(conform(frame, [desktop], zero, golden).findings).toEqual([]);
  });

  it("a renderer that declares no surface, which would otherwise be measured on nothing", () => {
    const report = conform(frame, [{ ...desktop, name: "declares-nothing", surfaces: [] }], config, golden);

    expect(messages(report, "frame.a_surface_is_drawn_only_where_declared")).toContain("declares no surface the frame names, so nothing of it could be measured");
  });

  it("a golden with a step the script no longer reaches", () => {
    const longer = { steps: [...(golden?.steps ?? []), { ...(golden?.steps.at(-1) as NonNullable<typeof golden>["steps"][number]), step: "a step nobody drives" }] };

    expect(messages(conform(frame, [desktop], config, longer), "frame.nothing_moved_since_it_was_approved")).toEqual([
      "differs from the approved projection at a step nobody drives: missing ≠ drawn",
    ]);
  });

  describe("approving", () => {
    const menubar: LaidSurface = { size: { width: 1, height: 1 }, regions: [{ name: "nav2", box: { x: 0, y: 0, width: 1, height: 1 }, holds: [{ name: "list", tree: element("Text", {}, "1 waiting") }] }] };
    const menu: ConformanceRenderer = {
      ...altered("z-menu-bar", () => ({ read: () => ({ surfaces: { menubar } }) })),
      surfaces: ["menubar"],
    };

    it("writes what the stubs draw, byte for byte the golden on disk", () => {
      const approval = approve(frame, stubs, config, golden);
      expect("golden" in approval && goldenText(approval.golden)).toBe(fs.readFileSync(FILES.golden, "utf-8"));
    });

    it("takes each surface from the first renderer that draws it", () => {
      const approval = approve(frame, [desktop, menu], config, golden);
      expect("golden" in approval && Object.keys(approval.golden.steps[0]?.surfaces ?? {})).toEqual(["menubar", "window"]);
      expect("golden" in approval && approval.golden.steps[0]?.sections).toEqual(["workflows", "work", "settings", "checks"]);
    });

    it("refuses to drop a surface the approved golden held", () => {
      const withMenu = approve(frame, [desktop, menu], config, golden);
      const previous = "golden" in withMenu ? withMenu.golden : undefined;

      expect(approve(frame, [desktop], config, previous)).toEqual({ refused: ["menubar is in the approved golden, and no renderer here draws it"] });
    });

    it("refuses a window that fails anything but the golden", () => {
      const approval = approve(frame, [altered("no-room", () => ({ pointer: () => [] }))], config, golden);
      expect("refused" in approval && approval.refused.length).toBeGreaterThan(0);
    });
  });

  it("a region, or a thing a region holds, drawn twice", () => {
    const doubled = altered("draws-twice", (session) => ({
      read() {
        const surface = window(session.read());
        const nav = surface.regions[0] as LaidSurface["regions"][number];
        const canvas = surface.regions.map((region) => (region.name === "canvas" ? { ...region, holds: [...region.holds, ...region.holds.slice(0, 1)] } : region));
        return { surfaces: { window: { ...surface, regions: [...canvas, { ...nav, box: { ...nav.box, x: surface.size.width - nav.box.width } }] } } };
      },
    }));
    const said = messages(conform(frame, [doubled], config, golden), "frame.no_region_is_invented");

    expect(said).toContain("nav2 is drawn twice");
    expect(said).toContain("canvas holds header twice");
  });

  it("a resize that only works the first time", () => {
    let sessions = 0;
    const once = altered("resizes-once", (session) => {
      sessions += 1;
      const mine = sessions;
      return { resize: (size) => (mine <= 3 ? session.resize(size) : undefined) };
    });
    const report = conform(frame, [once], config, golden);

    expect(report.findings.filter((finding) => finding.run === "keys, again").map((finding) => finding.message)).toContain(
      "the window is 1280×800, not the narrowest 720×480 it was resized to",
    );
  });

  it("two renderers with one name, which approval would collapse into one", () => {
    const twin = { ...terminal, name: desktop.name };
    const report = conform(frame, [desktop, twin], config, golden);

    expect(messages(report, "frame.renderers_agree_on_every_region")).toContain("2 renderers are named stub-desktop; each needs a name of its own to be compared");
    expect("refused" in approve(frame, [desktop, twin], config, golden)).toBe(true);
  });

  it("no renderer at all, which passes nothing", () => {
    expect(conform(frame, [], config, golden).assertions.every((each) => each.status === "failed")).toBe(true);
  });
});

// Renderers broken one way each, for the assertions the rule's four fixtures
// do not reach. Each is the installed desktop stub with one thing changed in
// what it reads back or how it answers; the harness is told nothing about it.
import { element, type Node } from "@amykit/ui";
import type { ConformanceRenderer, Laid, LaidSurface, Session } from "@amykit/ui/frame";
import { renderers as stubs } from "@amykit/plugin-ui-stub";

const [found] = stubs;
if (found === undefined) throw new Error("@amykit/plugin-ui-stub exports no renderer");
const stub: ConformanceRenderer = found;

function altered(name: string, change: (session: Session) => Partial<Session>, extra: Partial<ConformanceRenderer> = {}): ConformanceRenderer {
  return {
    ...stub,
    ...extra,
    name,
    start(options) {
      const session = stub.start(options);
      return { ...session, ...change(session) };
    },
  };
}

const withWindow = (laid: Laid, change: (window: LaidSurface) => LaidSurface): Laid => {
  const window = laid.surfaces.window;
  if (window === undefined) throw new Error("the stub drew no window");
  return { surfaces: { ...laid.surfaces, window: change(window) } };
};

const retree = (laid: Laid, region: string, hold: string, tree: (held: Node) => Node): Laid =>
  withWindow(laid, (window) => ({
    ...window,
    regions: window.regions.map((each) =>
      each.name !== region ? each : { ...each, holds: each.holds.map((held) => (held.name === hold ? { ...held, tree: tree(held.tree) } : held)) },
    ),
  }));

let sessions = 0;

export const renderers: readonly ConformanceRenderer[] = [
  altered("invents-a-region", (session) => ({
    read: () =>
      withWindow(session.read(), (window) => ({
        ...window,
        regions: [...window.regions, { name: "sidebar", box: { x: 0, y: 0, width: 1, height: 1 }, holds: [] }],
      })),
  })),
  altered("draws-a-menu-bar", (session) => ({
    read: () => ({ surfaces: { ...session.read().surfaces, menubar: { size: { width: 1, height: 1 }, regions: [] } } }),
  })),
  altered("plugin-section-first", (session) => ({
    read: () => retree(session.read(), "nav1", "section", (tree) => ({ ...tree, children: [...tree.children].reverse() })),
  })),
  altered("deaf-to-the-mouse", () => ({ pointer: () => [] })),
  altered("restless", (session) => {
    sessions += 1;
    const label = sessions > 3 ? "Groom again" : "Groom";
    return { read: () => retree(session.read(), "nav2", "groom", () => element("Button", { intent: { action: "groom", args: {} } }, label)) };
  }),
];

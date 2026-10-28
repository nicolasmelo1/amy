// Renderers broken one way each, for the assertions the rule's four fixtures
// do not reach. Each is the installed desktop stub with one thing changed in
// what it reads back or how it answers; the harness is told nothing about it.
import { element } from "@amykit/ui";
import { renderers as stubs } from "@amykit/plugin-ui-stub";

const [stub] = stubs;

function altered(name, change, extra = {}) {
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

const withWindow = (laid, change) => ({ surfaces: { ...laid.surfaces, window: change(laid.surfaces.window) } });

const retree = (laid, region, hold, tree) =>
  withWindow(laid, (window) => ({
    ...window,
    regions: window.regions.map((each) =>
      each.name !== region ? each : { ...each, holds: each.holds.map((held) => (held.name === hold ? { ...held, tree: tree(held.tree) } : held)) },
    ),
  }));

let sessions = 0;

export const renderers = [
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

// The stub that draws exactly the frame, except that the plugin's tab is
// lifted out of the canvas tabs and drawn among the sections in nav 1.
import { renderers as stubs } from "@amykit/plugin-ui-stub";

const [stub] = stubs;

const isPluginTab = (node) => typeof node !== "string" && node.props.intent?.args?.tab === "coverage";

function moved(window) {
  const canvas = window.regions.find((region) => region.name === "canvas");
  const tabs = canvas.holds.find((hold) => hold.name === "tabs").tree;
  const tab = tabs.children.find(isPluginTab);
  const regions = window.regions.map((region) => ({
    ...region,
    holds: region.holds.map((hold) => {
      if (hold.name === "tabs") return { ...hold, tree: { ...tabs, children: tabs.children.filter((child) => !isPluginTab(child)) } };
      if (hold.name === "section") return { ...hold, tree: { ...hold.tree, children: [...hold.tree.children, tab] } };
      return hold;
    }),
  }));
  return { ...window, regions };
}

export const renderers = [
  {
    ...stub,
    name: "plugin-tab-in-nav1",
    start(options) {
      const session = stub.start(options);
      return { ...session, read: () => ({ surfaces: { window: moved(session.read().surfaces.window) } }) };
    },
  },
];

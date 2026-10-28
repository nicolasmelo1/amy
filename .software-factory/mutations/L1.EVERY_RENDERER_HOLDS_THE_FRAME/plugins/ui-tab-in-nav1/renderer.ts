// The stub that draws exactly the frame, except that the plugin's tab is
// lifted out of the canvas tabs and drawn among the sections in nav 1.
import type { Child, Json } from "@amykit/ui";
import type { ConformanceRenderer, LaidSurface } from "@amykit/ui/frame";
import { renderers as stubs } from "@amykit/plugin-ui-stub";

const [stub] = stubs;
if (stub === undefined) throw new Error("@amykit/plugin-ui-stub exports no renderer");

const isPluginTab = (node: Child): boolean =>
  typeof node !== "string" && (node.props.intent as { args?: { tab?: Json } } | undefined)?.args?.tab === "coverage";

function moved(window: LaidSurface | undefined): LaidSurface {
  const canvas = window?.regions.find((region) => region.name === "canvas");
  const tabs = canvas?.holds.find((hold) => hold.name === "tabs")?.tree;
  const tab = tabs?.children.find(isPluginTab);
  if (window === undefined || tabs === undefined || tab === undefined) throw new Error("the stub drew no plugin tab in the canvas");
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

export const renderers: readonly ConformanceRenderer[] = [
  {
    ...stub,
    name: "plugin-tab-in-nav1",
    start(options) {
      const session = stub.start(options);
      return { ...session, read: () => ({ surfaces: { window: moved(session.read().surfaces.window) } }) };
    },
  },
];

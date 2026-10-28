// The desktop stub with a different header in the canvas: a renderer that
// agrees with the frame and disagrees with the other renderer.
import { element } from "@amykit/ui";
import { renderers as stubs } from "@amykit/plugin-ui-stub";

const [stub] = stubs;

function header(laid) {
  const window = laid.surfaces.window;
  const regions = window.regions.map((region) =>
    region.name !== "canvas"
      ? region
      : {
          ...region,
          holds: region.holds.map((hold) =>
            hold.name === "header" && hold.tree.type !== "Empty" ? { ...hold, tree: element("Row", {}, [element("Text", {}, "AMY-999")]) } : hold,
          ),
        },
  );
  return { surfaces: { window: { ...window, regions } } };
}

export const renderers = [
  {
    ...stub,
    name: "another-header",
    start(options) {
      const session = stub.start(options);
      return { ...session, read: () => header(session.read()) };
    },
  },
];

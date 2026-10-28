// The desktop stub with a different header in the canvas: a renderer that
// agrees with the frame and disagrees with the other renderer.
import { element } from "@amykit/ui";
import type { ConformanceRenderer, Laid } from "@amykit/ui/frame";
import { renderers as stubs } from "@amykit/plugin-ui-stub";

const [stub] = stubs;
if (stub === undefined) throw new Error("@amykit/plugin-ui-stub exports no renderer");

function header(laid: Laid): Laid {
  const window = laid.surfaces.window;
  if (window === undefined) throw new Error("the stub drew no window");
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

export const renderers: readonly ConformanceRenderer[] = [
  {
    ...stub,
    name: "another-header",
    start(options) {
      const session = stub.start(options);
      return { ...session, read: () => header(session.read()) };
    },
  },
];

// The stub that draws exactly the frame, with nav 2 moved to the right edge
// of the window and everything else slid left to make room.
import type { ConformanceRenderer, Laid, LaidSurface } from "@amykit/ui/frame";
import { renderers as stubs } from "@amykit/plugin-ui-stub";

const [stub] = stubs;
if (stub === undefined) throw new Error("@amykit/plugin-ui-stub exports no renderer");

function mirrored(laid: Laid): LaidSurface {
  const surface = laid.surfaces.window;
  const nav = surface?.regions.find((region) => region.name === "nav2");
  if (surface === undefined || nav === undefined) throw new Error("the stub drew no nav2 in its window");
  const regions = surface.regions.map((region) =>
    region.name === "nav2"
      ? { ...region, box: { ...region.box, x: surface.size.width - nav.box.width } }
      : { ...region, box: { ...region.box, x: region.box.x - nav.box.width } },
  );
  return { ...surface, regions };
}

export const renderers: readonly ConformanceRenderer[] = [
  {
    ...stub,
    name: "nav2-on-the-right",
    start(options) {
      const session = stub.start(options);
      return { ...session, read: () => ({ surfaces: { window: mirrored(session.read()) } }) };
    },
  },
];

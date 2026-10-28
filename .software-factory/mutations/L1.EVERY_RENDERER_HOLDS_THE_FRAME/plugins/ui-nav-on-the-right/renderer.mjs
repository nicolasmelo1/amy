// The stub that draws exactly the frame, with nav 2 moved to the right edge
// of the window and everything else slid left to make room.
import { renderers as stubs } from "@amykit/plugin-ui-stub";

const [stub] = stubs;

function mirrored(surface) {
  const nav = surface.regions.find((region) => region.name === "nav2");
  const regions = surface.regions.map((region) =>
    region.name === "nav2"
      ? { ...region, box: { ...region.box, x: surface.size.width - nav.box.width } }
      : { ...region, box: { ...region.box, x: region.box.x - nav.box.width } },
  );
  return { ...surface, regions };
}

export const renderers = [
  {
    ...stub,
    name: "nav2-on-the-right",
    start(options) {
      const session = stub.start(options);
      return { ...session, read: () => ({ surfaces: { window: mirrored(session.read().surfaces.window) } }) };
    },
  },
];

// The stub that draws exactly the frame, except the panel: toggled on or
// off, it never appears.
import { renderers as stubs } from "@amykit/plugin-ui-stub";

const [stub] = stubs;

export const renderers = [
  {
    ...stub,
    name: "never-draws-the-panel",
    start(options) {
      const session = stub.start(options);
      return {
        ...session,
        read() {
          const window = session.read().surfaces.window;
          return { surfaces: { window: { ...window, regions: window.regions.filter((region) => region.name !== "panel") } } };
        },
      };
    },
  },
];

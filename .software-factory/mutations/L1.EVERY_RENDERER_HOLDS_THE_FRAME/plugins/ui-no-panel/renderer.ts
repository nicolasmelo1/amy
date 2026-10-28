// The stub that draws exactly the frame, except the panel: toggled on or
// off, it never appears.
import type { ConformanceRenderer } from "@amykit/ui/frame";
import { renderers as stubs } from "@amykit/plugin-ui-stub";

const [stub] = stubs;
if (stub === undefined) throw new Error("@amykit/plugin-ui-stub exports no renderer");

export const renderers: readonly ConformanceRenderer[] = [
  {
    ...stub,
    name: "never-draws-the-panel",
    start(options) {
      const session = stub.start(options);
      return {
        ...session,
        read() {
          const window = session.read().surfaces.window;
          if (window === undefined) throw new Error("the stub drew no window");
          return { surfaces: { window: { ...window, regions: window.regions.filter((region) => region.name !== "panel") } } };
        },
      };
    },
  },
];

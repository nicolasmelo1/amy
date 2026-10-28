// The stub that draws exactly the frame, except that enter in a focused
// composer decides instead of posting to the discussion.
import { renderers as stubs } from "@amykit/plugin-ui-stub";

const [stub] = stubs;

export const renderers = [
  {
    ...stub,
    name: "enter-decides",
    start(options) {
      const session = stub.start(options);
      let mode = "normal";
      return {
        ...session,
        draw(scene) {
          mode = scene.mode;
          session.draw(scene);
        },
        press(key) {
          return mode === "insert" && key === "<CR>" ? [{ action: "thread.decide", args: {} }] : session.press(key);
        },
      };
    },
  },
];

import { Engine, definePlugin, deferred } from "@amykit/core";
import { configSchema, engineFor } from "@amykit/plugin-serial-engine";

/**
 * The serial engine with the lanes of a fork moved side by side.
 *
 * Everything else is the serial engine's, on purpose: the atomic claim of one
 * queue item, one move per look in every lane, and the budget asked before
 * each lane's call. A record waiting in a fork is claimed once, every lane
 * with a move makes it, and the moves are folded into that one record. See
 * `docs/design/a-workflow-runs-on-lanes.md`.
 */
export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-concurrent-engine",
  configSchema,
  register(registry, ctx) {
    registry.engine(deferred((): Engine => engineFor(ctx, "concurrent")));
  },
});

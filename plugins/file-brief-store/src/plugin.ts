import path from "node:path";
import { definePlugin } from "@amykit/core";
import { FileBriefStore } from "./FileBriefStore.js";
import { configSchema } from "./config.js";

/** The default local BriefStore; another adapter may replace this mount. */
export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-file-brief-store",
  configSchema,
  register(registry, ctx) {
    registry.port("brief", new FileBriefStore(path.join(ctx.paths.artifacts ?? ctx.paths.state, ctx.config.directory)));
  },
});

import path from "node:path";
import { Plugin } from "@amykit/core";
import { FileBriefStore } from "./FileBriefStore.js";
import { configSchema } from "./config.js";

/** The default local BriefStore; another adapter may replace this mount. */
export const plugin: Plugin = {
  name: "@amykit/plugin-file-brief-store",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    registry.port("brief", new FileBriefStore(path.join(ctx.paths.state, ctx.config.directory as string)));
  },
};

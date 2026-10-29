import path from "node:path";
import { definePlugin } from "@amykit/core";
import { FileStore } from "./FileStore.js";
import { configSchema } from "./config.js";

/** The record store only; briefs mount through their own adapter. */
export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-file-store",
  configSchema,
  register(registry, ctx) {
    registry.store(new FileStore(path.join(ctx.paths.state, ctx.config.directory)));
  },
});

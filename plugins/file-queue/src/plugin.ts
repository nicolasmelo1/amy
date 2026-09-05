import path from "node:path";
import { Plugin } from "@amykit/core";
import { FileQueue } from "./FileQueue.js";
import { configSchema } from "./config.js";

export const plugin: Plugin = {
  name: "@amykit/plugin-file-queue",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    registry.queue(new FileQueue(path.join(ctx.paths.state, ctx.config.directory as string)));
  },
};

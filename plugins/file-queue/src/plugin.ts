import path from "node:path";
import { definePlugin } from "@amykit/core";
import { FileQueue } from "./FileQueue.js";
import { configSchema } from "./config.js";

export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-file-queue",
  configSchema,
  register(registry, ctx) {
    const order = ctx.config.order ?? "id";
    if (order !== "id" && order !== "priority") {
      throw new Error(`file-queue order must be "id" or "priority", not ${JSON.stringify(order)}`);
    }
    registry.queue(new FileQueue(path.join(ctx.paths.state, ctx.config.directory), order));
  },
});

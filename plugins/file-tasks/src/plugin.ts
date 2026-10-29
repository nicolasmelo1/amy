import path from "node:path";
import { definePlugin } from "@amykit/core";
import { FileTasks } from "./FileTasks.js";
import { configSchema } from "./config.js";

export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-file-tasks",
  configSchema,
  register(registry, ctx) {
    registry.port(
      "tasks",
      new FileTasks(path.join(ctx.paths.state, ctx.config.directory), {
        defaultRepo: ctx.config.repo,
      }),
    );
  },
});

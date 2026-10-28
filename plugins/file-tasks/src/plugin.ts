import path from "node:path";
import { Plugin } from "@amykit/core";
import { FileTasks } from "./FileTasks.js";
import { configSchema } from "./config.js";

export const plugin: Plugin = {
  name: "@amykit/plugin-file-tasks",
  configSchema,
  register(registry, ctx) {
    registry.port(
      "tasks",
      new FileTasks(path.join(ctx.paths.state, ctx.config.directory as string), {
        defaultRepo: ctx.config.repo as string,
      }),
    );
  },
};

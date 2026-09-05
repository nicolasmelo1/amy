import path from "node:path";
import { Plugin } from "@amy/core";
import { FileTasks } from "./FileTasks.js";
import { configSchema } from "./config.js";

export const plugin: Plugin = {
  name: "@amy/plugin-file-tasks",
  version: "0.1.0",
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

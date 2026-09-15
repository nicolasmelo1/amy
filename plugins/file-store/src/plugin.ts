import path from "node:path";
import { Plugin } from "@amykit/core";
import { FileBriefStore } from "./FileBriefStore.js";
import { FileStore } from "./FileStore.js";
import { configSchema } from "./config.js";

export const plugin: Plugin = {
  name: "@amykit/plugin-file-store",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    registry.store(new FileStore(path.join(ctx.paths.state, ctx.config.directory as string)));

    // The briefs a second mount may read: one directory per profile, beside
    // the records, so two workflows under one `.amy` explain their own work
    // and never trip over each other's briefs. Mounted unconditionally
    // rather than only when a workflow asks: a port with nothing behind it
    // is a boot refusal, and the store costs one empty directory.
    registry.port(
      "brief",
      new FileBriefStore(path.join(ctx.paths.state, ctx.config.briefsDirectory as string)),
    );
  },
};

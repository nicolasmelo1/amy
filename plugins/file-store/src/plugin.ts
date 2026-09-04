import path from "node:path";
import { Plugin } from "@amy/core";
import { FileStore } from "./FileStore.js";

export const plugin: Plugin = {
  name: "@amy/plugin-file-store",
  version: "0.1.0",
  register(registry, ctx) {
    registry.store(new FileStore(path.join(ctx.paths.state, "tickets")));
  },
};

import { Plugin } from "@amy/core";
import { GitHubCodeHost } from "./GitHubCodeHost.js";

export const plugin: Plugin = {
  name: "@amy/plugin-github",
  version: "0.1.0",
  register(registry, ctx) {
    registry.port("code-host", new GitHubCodeHost(ctx.runner));
  },
};

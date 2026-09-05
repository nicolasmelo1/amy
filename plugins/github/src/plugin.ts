import { Plugin } from "@amykit/core";
import { GitHubCodeHost } from "./GitHubCodeHost.js";

export const plugin: Plugin = {
  name: "@amykit/plugin-github",
  version: "0.1.0",
  register(registry, ctx) {
    registry.port("code-host", new GitHubCodeHost(ctx.runner));
  },
};

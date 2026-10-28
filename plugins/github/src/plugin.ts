import { Plugin } from "@amykit/core";
import { GitHubCodeHost } from "./GitHubCodeHost.js";
import { configSchema } from "./config.js";

export const plugin: Plugin = {
  name: "@amykit/plugin-github",
  configSchema,
  register(registry, ctx) {
    registry.port("code-host", new GitHubCodeHost(ctx.runner, {
      baseBranch: ctx.config.baseBranch as Record<string, string> | undefined,
    }));
  },
};
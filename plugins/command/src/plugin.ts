import { Plugin } from "@amykit/core";
import { AllowedCommands } from "./AllowedCommands.js";
import { configSchema } from "./config.js";

export const plugin: Plugin = {
  name: "@amykit/plugin-command",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    // The action and the port together, which is what the registry asks of a
    // plugin adding an action the core does not ship. `run-command` is not in
    // the core catalogue because nothing has yet shown it is general — a
    // second workflow needing it is what would move it there.
    registry.action(
      "run-command",
      { port: "commands", method: "run" },
      new AllowedCommands(ctx.runner, {
        allow: (ctx.config.allow ?? {}) as Record<string, string>,
        cwd: (ctx.config.cwd as string) || ctx.paths.state,
        timeoutMs: ctx.config.timeoutMs as number,
      }),
    );
  },
};

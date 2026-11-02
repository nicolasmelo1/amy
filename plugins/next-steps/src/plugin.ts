import { definePlugin, GitBaseSource } from "@amykit/core";
import { NextStepsTracker } from "./NextStepsTracker.js";
import { configSchema } from "./config.js";

export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/plugin-next-steps",
  configSchema,
  register(registry, ctx) {
    if (!Number.isSafeInteger(ctx.config.rows) || ctx.config.rows < 1) {
      throw new Error(`the next-steps tracker needs rows to be a whole number of one or more, not ${ctx.config.rows}`);
    }
    // Reads only. The port is the tracker's, and a workflow mounting it runs
    // with its writes handed to the operator: there is nothing to write to.
    registry.port(
      "tracker",
      new NextStepsTracker(new GitBaseSource(ctx.runner, ctx.checkouts().layout), {
        repo: ctx.config.repo,
        table: ctx.config.table,
        rows: ctx.config.rows,
        branchPrefix: ctx.config.branchPrefix,
      }),
    );
  },
});

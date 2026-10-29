import { BaseSource, BRANCH_SETTINGS, ConfigSchema, GitBaseSource, GroomingTracker, definePlugin } from "@amykit/core";

export const configSchema = {
  repos: { type: "string[]", required: true, description: "repositories whose configured base branch grooming may read" },
  ...BRANCH_SETTINGS,
} satisfies ConfigSchema;

/** Mounts only narrow source and provider-neutral tracker capabilities. */
export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/workflow-feature-grooming",
  configSchema,
  register(registry, ctx) {
    for (const repo of ctx.config.repos) {
      if (ctx.paths.checkouts[repo] === undefined) {
        throw new Error(`the feature-grooming workflow needs a configured checkout for \`${repo}\``);
      }
    }
    const tracker = ctx.port("feature") as GroomingTracker | undefined;
    if (!tracker) throw new Error("the feature-grooming workflow needs the `feature` port, and nothing mounted it");
    const source: BaseSource = new GitBaseSource(ctx.runner, ctx.checkouts().layout);
    registry.port("grooming-source", source);
    registry.port("grooming-tracker", tracker);
  },
});

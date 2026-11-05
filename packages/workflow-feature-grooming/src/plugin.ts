import { BaseSource, BRANCH_SETTINGS, ConfigSchema, GitBaseSource, GroomingTracker, deferred, definePlugin } from "@amykit/core";

export const configSchema = {
  repos: { type: "string[]", required: true, description: "repositories whose configured base branch grooming may read" },
  ...BRANCH_SETTINGS,
} satisfies ConfigSchema;

/** Mounts only narrow source and provider-neutral tracker capabilities. */
export const plugin = definePlugin<typeof configSchema>({
  name: "@amykit/workflow-feature-grooming",
  configSchema,
  register(registry, ctx) {
    const tracker = ctx.port("feature") as GroomingTracker | undefined;
    if (!tracker) throw new Error("the feature-grooming workflow needs the `feature` port, and nothing mounted it");
    // Built once every plugin has registered: the workspace's provider mounts
    // after this workflow, and a repository with no checkout is still refused
    // at boot rather than at the first grooming.
    registry.port("grooming-source", deferred((): BaseSource => {
      const { layout } = ctx.checkouts();
      const named = layout.checkouts ?? {};
      for (const repo of ctx.config.repos) {
        if (named[repo] === undefined) {
          throw new Error(`the feature-grooming workflow needs a configured checkout for \`${repo}\``);
        }
      }
      return new GitBaseSource(ctx.runner, layout);
    }));
    registry.port("grooming-tracker", tracker);
  },
});

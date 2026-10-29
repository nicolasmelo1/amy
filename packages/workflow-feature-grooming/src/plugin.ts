import { BaseSource, ConfigSchema, GitBaseSource, GroomingTracker, definePlugin } from "@amykit/core";

export const configSchema = {
  repos: { type: "string[]", required: true, description: "repositories whose configured base branch grooming may read" },
  defaultBranch: { type: "string", default: "main", description: "fallback base branch for source snapshots" },
  baseBranch: { type: "record", default: {}, description: "per-repository base branch" },
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
    const source: BaseSource = new GitBaseSource(ctx.runner, {
      workspaceRoot: ctx.paths.workspace,
      checkouts: ctx.paths.checkouts,
      defaultBranch: ctx.config.defaultBranch,
      baseBranch: ctx.config.baseBranch as Record<string, string>,
    });
    registry.port("grooming-source", source);
    registry.port("grooming-tracker", tracker);
  },
});

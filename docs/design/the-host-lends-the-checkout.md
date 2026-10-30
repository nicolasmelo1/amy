# The host lends the checkout

Five plugins build the same object from the same parts:

```ts
new Git(
  ctx.runner,
  {
    workspaceRoot: ctx.paths.workspace,
    checkouts: ctx.paths.checkouts,
    defaultBranch: ctx.config.defaultBranch as string,
    baseBranch: ctx.config.baseBranch as Record<string, string> | undefined,
  },
  ctx.port("worktree") as Worktree | undefined,
)
```

`plugins/command-gate`, `plugins/plan-check` and all three
`packages/workflow-*`. The three workflows then build the same four-field
layout a second time, a few lines further down, for the question `Git` does not
answer — what a pull request opens against. And each of those plugins, plus
`plugins/github` and `packages/workflow-feature-grooming`, declares its own
`defaultBranch` and `baseBranch` settings, with its own wording of what they
mean.

Where a repository's checkout is and which branch is its base is a question the
host already answers — [a base branch per repository](a-base-branch-per-repository.md)
and [a checkout root per repository](a-checkout-root-per-repository.md)
are both about it. Every plugin that needs the answer rebuilds it, and the
second time it rebuilds it in the same file is how the two copies drift.

## What changes

- The core exports `BRANCH_SETTINGS`, the `defaultBranch` and `baseBranch`
  schema fields with one description, for a plugin to spread into its own
  schema.
- `PluginContext` gains `checkouts()`, which returns the `Git` and the layout
  for this plugin: the host's paths, this plugin's own branch settings, and
  the `worktree` port if one is mounted — read each time a path is asked for,
  so a worktree plugin listed after this one is still the one used.
- The five plugins use it; the seven schemas spread the shared fields, and so
  does `plugins/file-worktree`'s, which described the same two settings an
  eighth way. The GitHub plugin takes only `baseBranch`: its fallback is the
  forge's own default, not a setting.
- A `Git` reads its `worktree` port when a path is asked for, not when it is
  built, which is what lets a plugin ask for its checkouts while it registers.
- `lendCheckouts(runner, layout)` is the same answer for a layout already in
  hand, for a test that drives a port without mounting it. The architecture
  test refuses it, and `new Git`, in any shipped plugin's source.

The settings stay per plugin. Lifting them to one host-level setting would be
simpler still, but it changes every existing `config.yaml`, and that is a
migration with its own plan if it is wanted — not a side effect of this one.

## Acceptance criteria

- [x] `checkouts()` resolves a repository's base from the calling plugin's own
      `baseBranch`, falling back to its `defaultBranch`
      (proof: test:packages/core/tests/checkouts.test.ts)
- [x] A worktree port mounted by a plugin listed after the caller is the one
      its `Git` resolves paths through
      (proof: test:packages/core/tests/checkouts.test.ts)
- [x] Nothing outside `packages/core` constructs a `Git`
      (proof: test:packages/core/tests/architecture.test.ts)
- [x] A ticket still has its work cut from, and its pull request opened
      against, the base branch its repository names
      (proof: assertion:compose.a_commit_without_a_push_leaves_the_remote_where_it_was)

**Exit condition:** `grep -rn "new Git(" plugins packages` outside `dist/` and
`packages/core` finds nothing, and no shipped schema writes its own description
of `defaultBranch` or `baseBranch`.

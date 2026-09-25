# @amykit/plugin-claude

## 0.5.0

### Patch Changes

- Updated dependencies [d490ceb]
- Updated dependencies [98cc10e]
  - @amykit/core@0.5.0
  - @amykit/agent-kit@0.5.0
  - @amykit/model-specs@0.5.0

## 0.4.0

### Minor Changes

- f1557f6: The worktree is the workplace.
  
  The core grows a `worktree` port (`acquire`, `pathFor`, `states`, `release`,
  `prune`) and the `acquire-worktree` action beside it. `Git` gains worktree
  mode without losing shared-checkout mode: with the port mounted, every path
  it answers — agent prompts, the gate, plan checks, commits and pushes — is
  the item's own tree, cut from the default branch, and preparing an item never
  repoints the standing checkout's branch. The new `@amykit/plugin-file-worktree`
  mounts the port over `~/.amy/worktrees/<workflow>/<workId>/<repo>`, prunes
  terminal clean trees after retention, logs every removal as
  `worktree.removed`, and refuses to delete an in-flight or dirty tree. The CLI
  gains `amy worktrees list|remove|prune`, and `amy doctor` reports both roots.

### Patch Changes

- c7a36eb: A base branch per repository.
  
  `baseBranch:` maps a repository to its own base branch beside `defaultBranch`,
  which keeps its name and stays the fallback; a config without the block
  resolves exactly as before. The map rides `pluginSlices` to every reader of
  the layout — the harnesses, the gate, the worktree manager, whose trees are
  cut from the mapped branch, and the workflows, which resolve the repository's
  own base where the piece of work is known — and the pull request each workflow
  opens is told that base by name, falling back to the forge's own default when
  nothing was named.
- b3b7a07: A checkout root per repository.
  
  `checkouts:` maps a repository to its own path beside `workspaceRoot`; a
  repository named there is never looked for under the root at all, `~` expands
  the way the root's does, and a config without the block resolves exactly as
  before. The map rides the host paths and every `Git` layout to the worktree
  manager, which cuts a named repository's trees from its own checkout, and
  `amy doctor` names which root it asked for each repository.
- Updated dependencies [c7a36eb]
- Updated dependencies [2dc9117]
- Updated dependencies [b3b7a07]
- Updated dependencies [0ca2c1c]
- Updated dependencies [64b4d24]
- Updated dependencies [c30789e]
- Updated dependencies [fc6748a]
- Updated dependencies [5b37451]
- Updated dependencies [bfda1ac]
- Updated dependencies [a499e82]
- Updated dependencies [f1557f6]
  - @amykit/core@0.4.0
  - @amykit/agent-kit@0.4.0
  - @amykit/model-specs@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [4b54a6f]
  - @amykit/core@0.3.1
  - @amykit/agent-kit@0.3.1
  - @amykit/model-specs@0.3.1

## 0.3.0

### Minor Changes

- e603b3b: Refuse a dollar ceiling that cannot stop anything, and ask the harness rather
  than the price table.
  
  `specs.json` had no row for the Claude 5 family, so a run whose harness did not
  report a cost of its own was recorded with none, `spend.costUsd` never moved
  for it, and `amy budget` reported a figure that was arithmetically true and
  practically a lie. The table now prices `claude-opus-5`, `claude-sonnet-5`,
  `claude-opus-4-8`, `claude-sonnet-4-6` and `claude-fable-5-1`, declares the
  short names a harness CLI accepts (`opus`, `sonnet`, `haiku`, `fable`) so a
  ladder written in them can be recognised, and adds `gpt-5.3-codex` and
  `gpt-5.3-codex-spark`. A refresh keeps the aliases and the long-context
  tiering, because models.dev carries neither.
  
  A price table always lags, so the lasting half is that the ceiling knows: a
  `costUsd` ceiling is refused at boot when a rung in any ladder — including a
  step's own — names a model whose cost nobody could work out, naming the model
  and the rung.
  
  **Whose cost nobody could work out is not the same question as whose model is
  in the table**, and conflating the two is the reason this is one change rather
  than two. A rung now declares whether its harness accounts for itself
  (`Rung.pricesItsOwnRuns`), and only a rung that does not is measured against
  the table:
  
  - **claude** puts `total_cost_usd` in its envelope, and a cost the harness
    reported beats anything a table computes.
  - **hermes** writes `cost_status: "included"` for a run a subscription or a
    local model covered — where zero is the right answer rather than a missing
    one, and no price list will ever publish a rate for a model running on
    somebody's own machine — and prices the rest of its providers itself.
  - **codex** reports no cost of its own, so the vendored table is the only way
    one of its runs gets a price. It is the one harness a missing row leaves a
    dollar ceiling inert for.
  
  Reading the table's answer as the whole question would refuse an install whose
  ceiling works perfectly well, which is the same failure as an inert ceiling
  reached from the other side: a machine that will not start over a number it
  already has.
  
  The refusal also no longer offers a command that could not fix it.
  `amy models refresh` re-rates the models the table already has and never adds
  one, so a model with no row at all is told to get one in
  `.amy/model-specs.json`, or a ceiling in tokens. `amy budget` says the same.
  
  **Breaking for one config shape:** `ladder: [codex]` — a codex install naming
  no model — is now refused under a `costUsd` ceiling, because there is no id to
  price it by and codex reports nothing to price it with. Name the model
  (`codex:gpt-5`) or set the ceiling in tokens.

### Patch Changes

- Updated dependencies [e603b3b]
- Updated dependencies [a0ec22e]
  - @amykit/model-specs@0.3.0
  - @amykit/agent-kit@0.3.0
  - @amykit/core@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [e955a7d]
- Updated dependencies [d551e5b]
- Updated dependencies [b53de08]
- Updated dependencies [eb5214d]
- Updated dependencies [f9944f6]
- Updated dependencies [76692e1]
- Updated dependencies [353d361]
- Updated dependencies [2b6bde3]
- Updated dependencies [a97c34d]
- Updated dependencies [0b5e3d8]
- Updated dependencies [616f7e6]
  - @amykit/agent-kit@0.2.0
  - @amykit/model-specs@0.2.0
  - @amykit/core@0.2.0

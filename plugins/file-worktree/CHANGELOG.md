# @amykit/plugin-file-worktree

## 0.7.0

### Minor Changes

- b761f29: **A config is typed by its schema.** `definePlugin` gives a plugin's register and ready hooks the post-validation type derived from its schema, rejects mismatched defaults, and moves every shipped schema onto that declaration. Scalar and `string[]` settings no longer cast away the host's validation; record settings remain explicitly narrowed where a plugin needs a stronger value shape.
- 1ad01d3: **A command belongs to the package that means it.** A plugin declares
  `commands`, `checks` and `files` beside `register`, read after the module is
  imported and before anything mounts: `amy --help` lists `amy roster` beside
  the workflow that brought it, `amy doctor` runs the checks it brought, and
  `amy init`/`amy add` write the files it brought into the profile's state,
  once. A command that declares `mount: true` receives the mounted ports or a
  refusal naming why the machine did not come up; every other command answers on
  the machine that will not boot, which is when it matters.
  
  The host keeps the entry point and the ownership rules. A name belongs to one
  package, reusing a built-in or another package's command is refused at load
  naming both owners, and a command run against a profile that does not mount
  its owner names the profiles that do.
  
  `amy btw` moved to the errand, `amy note` to note-to-plan, `amy roster` to
  ticket-to-qa, `amy worktrees` to the worktree adapter and `amy models` to the
  relay; the CLI imports none of them. `pause` and `resume` became
  `amy stop --all` and `amy start`, `discover` became the first act of `amy
  tick` and is hidden rather than listed, `poke` became `look`, `workflow rm` merged into
  `amy remove <profile>` with `--keep-state`, the two `plugin add`/`plugin
  remove` verbs are gone, and `daemon`/`after-daemon` are hidden and still
  callable. A price table older than seven days is refreshed by `amy update`
  and `amy start` through the relay's own command, and a refresh that fails
  leaves the table as it was.
  
  Because `tick` now looks before it moves, two loops it exposed are closed: a
  note the machine wrote about its own failure is not itself planned, and
  discovery does not bring back work that reached its attempt ceiling: the
  record says `gaveUp`, and `amy look <id>` is the only thing that clears it.
  
  `HostPaths` gains `profile`, the directory a profile owns, so a workflow that
  keeps a file beside its records — the roster — reads what its own command
  writes. The roster moved there, which is why `amy init` no longer writes it on
  a machine that mounts nothing that assigns reviewers.
- 3649573: Plugin versions and unused workflow observer declarations were removed; package manifests supply displayed versions.
- 2363da5: **The host lends the checkout.** `PluginContext` gains `checkouts()`, which answers with the `Git` and the layout for the calling plugin — the host's paths, the plugin's own `defaultBranch` and `baseBranch`, and the `worktree` port read whenever a path is asked for, so a worktree plugin listed after the caller is still the one used. The core exports `BRANCH_SETTINGS`, the two branch settings with one description, and every shipped schema that declares them spreads it in place of its own wording. The command gate, the plan check and the three workflows that opened pull requests ask their context instead of building a `Git` and a second copy of its layout. The settings stay per plugin, so no `config.yaml` changes; the plan check's `baseBranch` now defaults to `{}` like every other's.

### Patch Changes

- Updated dependencies [b761f29]
- Updated dependencies [2c7324c]
- Updated dependencies [1ad01d3]
- Updated dependencies [ebae48c]
- Updated dependencies [989f399]
- Updated dependencies [7d2dd00]
- Updated dependencies [da95fc7]
- Updated dependencies [b83a214]
- Updated dependencies [8b21570]
- Updated dependencies [3649573]
- Updated dependencies [f9b65f6]
- Updated dependencies [37504c1]
- Updated dependencies [2363da5]
- Updated dependencies [0815efb]
  - @amykit/core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [9e3cb22]
  - @amykit/core@0.6.0

## 0.5.0

### Patch Changes

- b8c781a: Let a project keep three phases — `brief/`, `workflow/`, `test/` — that share briefs while keeping state and spending isolated. Every such folder is a phase, a lone `workflow/` included, so its state moves under the project key and nothing is kept from an old profile of the same name. Each phase keeps its own tasks and Slack threads, `amy brief` names the missing `brief/` when a project has none, and `amy stop` signals only the selected phase's daemon without touching the shared handbrake.
- Updated dependencies [d490ceb]
- Updated dependencies [b8c781a]
- Updated dependencies [c1edd17]
- Updated dependencies [5ff03ad]
- Updated dependencies [3a993e1]
- Updated dependencies [f259468]
- Updated dependencies [75e1f57]
- Updated dependencies [8b2fcc8]
- Updated dependencies [9bb3d24]
- Updated dependencies [98cc10e]
  - @amykit/core@0.5.0

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
- Updated dependencies [c30789e]
- Updated dependencies [fc6748a]
- Updated dependencies [5b37451]
- Updated dependencies [bfda1ac]
- Updated dependencies [f1557f6]
  - @amykit/core@0.4.0

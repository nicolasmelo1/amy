# @amykit/plugin-next-steps

## 0.7.1

### Patch Changes

- Updated dependencies [e79dea1]
  - @amykit/core@0.7.1

## 0.7.0

### Minor Changes

- ae198b8: A row of next steps is a ticket. `@amykit/plugin-next-steps` mounts the
  `tracker` port over an execution-order table — `plans/next-steps.md` by
  default — read from the base branch, never from the standing checkout: a row
  is a work item, its linked plan the body, its place in the table the
  priority. A relative link is a plan in the table's repository, its id the
  slug; an `owner/name:plans/<slug>.md` link is one in another, its id
  `owner+name+<slug>`, so one table can order the work of several. Only the top `rows` (one by default) are work at once, a row
  gone from the table with its plan in `docs/design/` reads as `delivered`, and
  the branch is `branchPrefix` (`plan/` by default) and the plan's slug.
  
  It writes nothing: mount `ticket-to-qa` on it with `policy.writes: operator`
  and `qaStatusName: delivered`, and a row reaches delivered when you merge the
  pull request that moves its plan.
- d85dacd: **A workspace is a capability.** Nothing is handed a workspace without asking: plugins borrow their checkouts through a `workspace` port the file-worktree plugin mounts, and workflows inherit them from their support, so a machine that works nowhere in particular needs none. The seven machine keys — `repos`, `workspaceRoot`, `checkouts`, `defaultBranch`, `baseBranch`, `gate` and `worktrees` — are read from the plugins whose slices carry them (`plugins: "@amykit/plugin-file-worktree"` for the six workspace keys, `plugins: "@amykit/plugin-command-gate"` for the gate). The doctor asks about checkouts, worktrees, `gh` and `git` only where a workspace was mounted, so a machine that drives no code — a support inbox, say — is told it is ready, and `amy update` moves an old install's keys under those slices, saying each move, keeping the original beside the config, and refusing a key put back at the top level by name. The provenance of every derived slice, now a property with its own falsifier (`machine_key_leaks_into_a_slice`).

### Patch Changes

- 09cb74f: The docs describe the contract that exists. Every README is rewritten against the code: a plugin's README lists the ports, actions, operations, commands, events and environment its package registers, and opens with `amy.about`, a new field in its package.json saying when to use it.
- Updated dependencies [b761f29]
- Updated dependencies [3b540fa]
- Updated dependencies [cea9b94]
- Updated dependencies [2c7324c]
- Updated dependencies [1ad01d3]
- Updated dependencies [4a55287]
- Updated dependencies [91f6caf]
- Updated dependencies [ac4faca]
- Updated dependencies [ebae48c]
- Updated dependencies [2b4deec]
- Updated dependencies [989f399]
- Updated dependencies [7d2dd00]
- Updated dependencies [da95fc7]
- Updated dependencies [b83a214]
- Updated dependencies [65ebf9f]
- Updated dependencies [8b21570]
- Updated dependencies [d85dacd]
- Updated dependencies [c7cd07a]
- Updated dependencies [bb67d1f]
- Updated dependencies [ec32d67]
- Updated dependencies [b266baf]
- Updated dependencies [f062bea]
- Updated dependencies [3649573]
- Updated dependencies [f4069bb]
- Updated dependencies [09cb74f]
- Updated dependencies [f9b65f6]
- Updated dependencies [37504c1]
- Updated dependencies [2363da5]
- Updated dependencies [0ef3ae3]
- Updated dependencies [0815efb]
  - @amykit/core@0.7.0

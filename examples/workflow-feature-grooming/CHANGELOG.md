# @amykit/workflow-feature-grooming

## 0.8.1

### Patch Changes

- Updated dependencies [e7a5a2e]
  - @amykit/core@0.8.1

## 0.8.0

### Patch Changes

- a41a17f: **A shipped workflow runs as a phase.** A project walking BRIEF → WORK → PROVE on amy's own pieces stopped three times in 0.7.1, and the whole-project example hid all three. It never ran ticket-to-qa (it set the WORK child to `DONE` by hand), and it ran actions without the boot check the daemon makes.
  
  - **The unit a called record is for is the core's.** A called record's id is `SHOP-1/WORK#1`. ticket-to-qa asked the tracker for that id as a ticket, and its review lane did the same. errand and note-to-plan looked for a task and a note under it. prove, feature-grooming and the worktree plugin each kept a private split on `/`. `unitOf(record)` from `@amykit/core` now says what the unit is at any depth, keeping a root's `@repository`, and every one of them uses it. `L0.A_CALLED_RECORD_NAMES_ITS_UNIT` refuses a split of an id on `/` or `#` outside the core.
  - **The testkit walks every world called as a phase too.** `conformance` and `conforms` now walk each world a second time as `UNIT/PHASE#1`, under a new property, "called as a phase, it does what it does standing alone". The two walks must make the same tracker, code-host and conversation calls, plan the same actions and come to rest in the same state. A world that keeps state gives `again()` to be rebuilt, and `said()` with `watched()` to say what its ports were asked. A checkout or an agent's context may still key on the record's own id.
  - **A claude run that may write can write.** A print-mode run with no `--permission-mode` and the user's settings dropped is refused every edit, so a writing step answered and changed nothing. The new `permissionMode` setting (default `acceptEdits`; `auto` or `bypassPermissions` also allowed) is now always passed, and a read-only run is still `plan`. An empty, unknown or non-writing mode is refused at mount, naming the setting. `harnessConformance` in agent-kit holds claude and codex to it.
  - **A core action's name means the core's action.** prove's gave-up notice was a handler named `escalate`, the core's tracker write, so the mount counted a write prove never makes, for a tracker it does not need. It is now `give-up`. prove's own actions also reached no catalogue, so called as a phase it was refused ("action `lease`: nothing defines it"). A workflow's `catalogue` now declares its own actions on ports it needs, and the composed workflow carries every callee's to the mount. A handler under a core action's name, in a workflow that does not need that action's port, is refused at boot.
  - **A called phase is counted as it is standing alone.** A workflow's catalogue entry is now the port its handler reaches, so prove's agent step, now its own `run-agent-step` catalogued on `agent`, is counted by the budget through every call (it ran while the budget refused agent work), while a deterministic or `wait-until` step stays a `run-step` the budget does not hold; prove still boots with no agent mounted. A called workflow's `store` (by the name it asks for, whatever its call binds it to) lists its own records under every root rather than its caller's roots, so errand's `maxInFlight` and note-to-plan's `maxOpenPlansPerRepo` count errands and plans called as phases.
  - **A unit has one conversation, and reading it opens none.** `Conversation` gains a required `known(workId)`, which answers the thread a work already has and creates nothing. Slack, Telegram and the terminal implement it, and a conversation adapter of your own must too. ticket-to-qa reads replies through it, so a look that only reads leaves no thread behind. A called phase's threads are the unit's, titled by the ticket, setup's included. The notifier posts into the unit's thread too, instead of opening one under the call's id.
- Updated dependencies [a41a17f]
- Updated dependencies [9a9ac0a]
- Updated dependencies [3a8cc7a]
  - @amykit/core@0.8.0

## 0.7.1

### Patch Changes

- Updated dependencies [e79dea1]
  - @amykit/core@0.7.1

## 0.7.0

### Minor Changes

- b761f29: **A config is typed by its schema.** `definePlugin` gives a plugin's register and ready hooks the post-validation type derived from its schema, rejects mismatched defaults, and moves every shipped schema onto that declaration. Scalar and `string[]` settings no longer cast away the host's validation; record settings remain explicitly narrowed where a plugin needs a stronger value shape.
- a867574: **A phase is proven, not asserted.**
  
  A project's `prove/` phase used to have nothing to call: passing the tests a
  branch can run was the only evidence that work held, and it isn't evidence.
  `@amykit/plugin-prove` is that phase. Its one workflow walks the scenario the
  brief settled against the real system, and every scenario walks the same
  diagram, so one curl and two apps with a fixture and a person differ in data
  alone. The scenario is a `Scenario` section of the brief, so `amy brief check`
  refuses a brief without it, or with a step naming an operation no mounted plugin
  offers, and grooming does not stop until it is there.
  
  A step calls an operation by id. A step is deterministic unless it says
  `agent`, `human` or `wait-until`. An agent step that passes is kept as the
  calls it made and replayed with no model. A human step asks in the work's
  thread and keeps its leases while it waits. An assertion the run cannot
  evaluate is `unsupported`, which blocks completion and is never counted as a
  pass. A resource is the commands its person configured, run through the
  commands port, and is refused at mount without a `check`. Its seats are leased
  for the whole machine under Amy home, by priority, so two tickets needing one
  account take turns. A fixture reads the world, acts only on what differs, and
  asks a person when it cannot.
  
  Each run leaves a proof in the project's artifact root, which `amy prove show`
  reads. The proof stops counting when the code digest or the brief revision
  moves. `amy prove record` records a run a person did by hand the same way.
  
  Three drivers ship as plugins of their own, each offering operations:
  `@amykit/plugin-agent-browser` (open, snapshot, act on refs, diff, and a UI
  check that settles on the accessibility tree, then pixels, then an agent),
  `@amykit/plugin-agent-desktop` and `@amykit/plugin-terminal`.
  
  `@amykit/workflow-feature-grooming` is now a workflow a project's `brief/`
  calls. It waits while the brief is groomed, then returns the criteria the
  brief settled. It no longer mounts the `grooming-source` and
  `grooming-tracker` ports, which nothing read; `groomFeature` is unchanged.
  `examples/a-whole-project` walks brief, work and proof with the three shipped
  workflows.
  
  A project whose later phase asks the brief something now waits in `GROOMED`
  after BRIEF until every phase's brief check is green. Before, the brief phase's
  own check was enough to start the work, so a brief with no scenario reached
  WORK and was only caught once it got to PROVE.
- 3649573: Plugin versions and unused workflow observer declarations were removed; package manifests supply displayed versions.
- 2363da5: **The host lends the checkout.** `PluginContext` gains `checkouts()`, which answers with the `Git` and the layout for the calling plugin — the host's paths, the plugin's own `defaultBranch` and `baseBranch`, and the `worktree` port read whenever a path is asked for, so a worktree plugin listed after the caller is still the one used. The core exports `BRANCH_SETTINGS`, the two branch settings with one description, and every shipped schema that declares them spreads it in place of its own wording. The command gate, the plan check and the three workflows that opened pull requests ask their context instead of building a `Git` and a second copy of its layout. The settings stay per plugin, so no `config.yaml` changes; the plan check's `baseBranch` now defaults to `{}` like every other's.

### Patch Changes

- 09cb74f: The docs describe the contract that exists. Every README is rewritten against the code: a plugin's README lists the ports, actions, operations, commands, events and environment its package registers, and opens with `amy.about`, a new field in its package.json saying when to use it.
- 599b4bd: **The examples are not the machine.**
  
  The five workflows amy ships moved from `packages/` to `examples/`, under the
  same names and versions, so an install that names one updates without
  noticing. `packages/` now holds amy itself and what it needs to run. Each
  example opens its README with what it is for, written for somebody who has
  never seen amy, above the reference generated from the package. A fork of a
  version released after the move is read from `examples/`, and a fork taken
  before it follows the release to its new directory on `amy update` instead of
  stopping the update.
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

## 0.6.0

### Patch Changes

- Updated dependencies [9e3cb22]
  - @amykit/core@0.6.0

## 0.5.0

### Patch Changes

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

- c30789e: Add provider-neutral feature grooming with read-only base-branch snapshots and reconciliation provenance.

### Patch Changes

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

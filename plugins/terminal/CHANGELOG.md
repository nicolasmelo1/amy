# @amykit/plugin-terminal

## 0.8.0

### Patch Changes

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

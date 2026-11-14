# @amykit/workflow-pull-request

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

- 989f399: **A workflow can call another, the way code calls a function.** A diagram
  marks a state `class X call`, and `calls` binds it to the workflow it calls:
  `call(review, { input, config, ports, output, effects })`, every member
  optional. The callee runs as a child record kept inside its caller's
  (`PROJ-1/REVIEW#1`), with its own history and attempts, and only the deepest
  record in a call is observed. When the child ends, the caller takes the edge
  named for that end, folding what it returned. Before this, composing
  workflows meant importing another's states and record fields in TypeScript,
  and nothing showed or checked where one ended and the other began.
  
  Everything that can be wrong with a call is refused at boot, naming the call
  path: a call state with no binding, an end with no edge, an `output` for an
  end that returns nothing, an `input` for a callee that takes none, a need no
  mounted port satisfies (`oncall → REVIEW → FIX: needs code-host`), a cycle at
  any depth, and a callee claiming a write its caller does not. `port()` takes
  `requires`, for a method a port only offers optionally.
  
  **The pull request is opened by one shipped workflow.** `note-to-plan` and the
  errand both opened a pull request and waited for it, written twice. Both now
  call `@amykit/workflow-pull-request`, which opens or finds one through the
  `CodeHost` port and returns `OPENED` with its number and link, or `REFUSED`
  with the host's reason. A refused pull request hands the work back with that
  reason, where before it failed every look until the machine gave up. The
  port gains `CodeHostRefusal`, and the GitHub adapter throws it for a 422, so
  an answer is told apart from an outage, which is still retried.
  
  **A callee can be copied in and owned.** `amy workflow add <spec> --into
  <name>` copies a workflow, with every file its entry imports, into one of your
  own, installing what it depends on; a dependency that cannot be resolved
  refuses the copy before anything is written. `amy workflow export --expand`
  draws each call as the workflow it calls, and `amy status` shows where work
  stands through its calls, with a callee's escalation as the root's attention.
- f4069bb: **The config is written by what is mounted.** Every workflow's own
  vocabulary — the attempt ceilings its decisions read, the status a ticket
  moves to, where plans go and what judges them — moved out of the config's top
  level and into the profile that drives the workflow, checked at mount against
  the workflow's own `configSchema`. `amy init` writes a config that carries
  only the machine, and a commented example that teaches the shape;
  `amy add <workflow>` writes the profile block from what the workflow's schema
  asks for, with the settings that need an answer written as placeholders and
  the rest taken from defaults. `amy config explain` lists every setting the
  machine and each mounted thing carries, with its type, its default and the
  reason it is there; `amy config explain <plugin>` narrows to one.
  
  A key of the old shape left at the top level is refused at boot by name, with
  the place it moved to in the message, so nothing is silently read from where
  it lived. `amy update` moves a v1 config for you: each old key is rewritten
  under the profile or the plugin that reads it, the original file is kept
  beside the config as `config.yaml.moved`, and a second update changes
  nothing. The engine learns to tune itself at the same time — the serial
  engine's retry between failed items is its own setting now, no longer
  borrowed from whichever workflow's poll happened to be at the top of the
  config.

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

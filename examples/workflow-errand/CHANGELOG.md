# @amykit/workflow-errand

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
  - @amykit/workflow-pull-request@0.8.0
  - @amykit/plugin-file-queue@0.8.0

## 0.7.1

### Patch Changes

- Updated dependencies [e79dea1]
  - @amykit/core@0.7.1
  - @amykit/workflow-pull-request@0.7.1
  - @amykit/plugin-file-queue@0.7.1

## 0.7.0

### Minor Changes

- b761f29: **A config is typed by its schema.** `definePlugin` gives a plugin's register and ready hooks the post-validation type derived from its schema, rejects mismatched defaults, and moves every shipped schema onto that declaration. Scalar and `string[]` settings no longer cast away the host's validation; record settings remain explicitly narrowed where a plugin needs a stronger value shape.
- 2c7324c: **A mount builds once.** `port`, `engine` and `contribute` accept `deferred(() => impl)`: the host builds it once every plugin has registered, once per mount and before any `ready`, building on demand when one reads another, so the order plugins are listed in does not matter. A build that throws is a boot refusal naming its plugin, and two builds that read each other are refused naming both. The agent relay, the serial engine and the three shipped workflows use it in place of their own `WeakMap<PluginContext, …>`, getter proxies and build-early `ready`. One behaviour change: the serial engine is now built at boot, so an engine with no workflow, no runtime or no queue, store or notifier is refused when the host mounts rather than on its first tick.
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
- 4a55287: **A plugin brings operations, not commands.** `PluginCommand` is removed: a
  plugin declares `operations` — each one `defineOperation`, with its input and
  output schemas — and the command line is drawn from them like every other
  door. Installing a plugin adds its command, its entry in `amy contract` and the
  id an action can call; removing it takes all three. A plugin that still
  declares `commands` is refused at load, naming the plugin and the member.
  
  - Each operation with `cli` words is a command, marked with its package in
    `amy --help`. Its positional fields are arguments, every other field a flag;
    a number is parsed, a boolean is a bare flag, an array repeats, an enum lists
    its values, and a value that does not parse is refused naming the flag.
  - `--json` prints the output as JSON, a stream as JSON Lines and an error as
    the `{ code, message, details? }` envelope on stderr. Without it the output
    is drawn from itself and its schema: objects as labelled fields, arrays of
    objects as tables, enums coloured. No operation draws its own output.
  - The exit code is the outcome: 0 an output, 1 a declared error, 2 an input
    refused, 70 anything undeclared or a machine that would not mount.
  - `amy contract` prints the install's whole contract — amy's services and every
    mounted plugin's operations — as an OpenAPI document; `amy contract --check`
    refuses one that does not build. A plugin's operation is local-only unless it
    says `localOnly: false`.
  - An operation id and a command's first word each belong to one package; a
    second claiming either is refused at load, naming both.
  - A workflow's action calls a mounted plugin's operation by id with
    `operate(id, input)`, getting the output or the error, and reaches only what
    its profile mounts.
  - `amy btw`, `amy note`, `amy roster`, `amy worktrees` and `amy models` keep
    their words and are now operations. Their output is drawn rather than
    written by hand, and each takes `--json`.
- ac4faca: **A project is brief, work and proof.** The `brief/`, `workflow/` and
  `prove/` folders of a project compose the one workflow its config entry
  drives: each phase a `call()` to the `defineWorkflow` declaration its folder
  exports, walked as child records of one record, one profile and one daemon
  for the whole walk. The brief's own declared sections give the walk its
  vocabulary, what the brief workflow returned is what the proving workflow is
  handed as its input exactly, and an end named `refused` carries the row back
  to WORK, saying what did not hold. A phase neither present nor declared
  absent is refused at the walk's mount, naming it; a phase declared absent
  carries its reason on the workflow for `amy status` to show; a `test/`
  folder is told the phase is named `prove/`.
  
  `defineWorkflow` gains the optional `phases` member — one reason per
  declared-absent phase — which the plugin carries beside its workflow; the
  shipped `errand`, `note-to-plan` and `ticket-to-qa` declare brief and prove
  out with their reasons, and every other package is unchanged. A project's
  queue, records, tasks, threads and log live under
  `projects/<project>/<profile>` with its briefs under the project's shared
  artifact root; the per-phase layout of an older machine stays on disk,
  unread, and `amy update` folds a config that named one project as three
  phase profiles into its single project profile, saying every fold and
  moving nothing the second time.
- 989f399: **A workflow can call another, the way code calls a function.** A diagram
  marks a state `class X call`, and `calls` binds it to the workflow it calls:
  `call(review, { input, config, ports, output, effects })`, every member
  optional. The callee runs as a child record kept inside its caller's
  (`TBO-1/REVIEW#1`), with its own history and attempts, and only the deepest
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
- 7d2dd00: **A workflow is a Mermaid diagram.** A workflow's shape is the `workflow.mmd` beside it — an ordinary `stateDiagram-v2` that GitHub and Obsidian render — and the host reads its states, start, waits and ends from it when the workflow mounts; `defineWorkflow`'s `states`, `waiting` and `terminal` are required only without one, and declaring both is refused at boot. `readDiagram`, `connects`, `markState`, `withDiagramBeside` and the `notWritten()` stub are in the core, Mermaid-checked against Pele in its tests. The engine logs a move the diagram does not draw as `workflow.undrawn_transition` and makes it anyway; the testkit fails one, and with `everyEdge` an arrow no world walks. `amy workflow new --from <file.mmd>` turns a diagram into a workflow that mounts with every decision a stub, `amy workflow check` lists the stubs and the arrows not walked, and `amy workflow export [--work <id>]` prints the diagram with a record's state marked. `StateMachine` takes an optional `diagram`. The three shipped workflows are each drawn as one and lose their state lists and their exported unmounted `errand`, `noteToPlan`, `ticketToQa` and `newRecord`; bind a plugin with `withDiagramBeside(plugin, entry)` instead. `ticket-to-qa` no longer asks a reviewer again on every look when nothing was pushed since they requested changes.
- da95fc7: **A workflow is one declaration.** `defineWorkflow` registers the pure machine and its deferred runtime together, resolves typed required and optional ports, validates and merges policy defaults, and constructs the core record fields. `planning` supplies the four typed plan constructors, and `amy workflow new` writes the new declaration.
- b83a214: Workflows can now declare one decision per diagram state, compose pure
  `before` and `after` filters around those decisions, and provide `discover`,
  `observe`, `actions`, and `remember` as individual runtime pieces. `extend`
  mounts supporting infrastructure from the same declaration. Legacy
  `plan`/`runtime` declarations and raw plugins remain supported, while mixing
  the legacy and new declaration members is refused at boot.
  
  The `agent` port an action receives now records every run as `agent.run`, and
  an action's `announce(text)` turns a failed announcement into `notify.failed`,
  so no workflow writes either by hand. `ports.notifier` stays strict.
  
  `amy workflow new` now writes a runnable diagram-backed three-piece workflow.
  The shipped errand, note-to-plan, and ticket-to-QA workflows use the new form.
- cb92285: **The actions use the ports.** The errand, note-to-plan and ticket-to-qa write
  `discover`, `observe`, `remember` and every action as a function of the scope
  `defineWorkflow` hands it: `scope.ports`, `scope.config`, `scope.policy`,
  `scope.checkouts`, `scope.ctx` and `scope.announce`. `errandRuntime`,
  `planRuntime` and `ticketRuntime` are gone, with their `…RuntimeDeps` and
  `…RuntimeConfig` types; a test that built one mounts the declaration instead.
  
  Before, each workflow kept the factory it had before `defineWorkflow`, and a
  `WeakMap` adapter that assembled a deps object out of the scope to build it:
  three copies of the same adapter. It cached nothing for an action, whose scope
  is a new object every time, so every action rebuilt the whole runtime; and
  ticket-to-qa carried its own `agent.run` and `notify.failed` lines behind an
  `accountsAgentRuns: false` switch, beside the host's, when the framework
  already hands every action an agent that accounts for each reply and an
  `announce` that cannot cost a move. ticket-to-qa's progress policy is read
  from `budget` through the declaration's `progress(scope)`, and its roster is
  read from the profile when a look needs it, as before.
- 3649573: Plugin versions and unused workflow observer declarations were removed; package manifests supply displayed versions.
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
- f9b65f6: **An errand that answered a question is not delivered as an empty pull
  request.**
  
  `run-errand` decided whether the errand had changed something by asking
  whether the push had moved the remote. `prepareBranch` has already created
  the branch, so publishing it for the first time is a new remote ref whether
  or not it carries a commit — a question reached `PR_OPEN` with no diff in it.
  `Git` grows `commitsAhead(repo, of, workId)`, and the errand commits, asks
  that question and only pushes when there is something to review; the branch
  of an errand that changed nothing stays local.
  
  **An errand the agent refuses is declined at once, with its reason.** The
  prompt already asked the agent to say so plainly when a sentence could not be
  done as asked, but nothing read it. A refusal that changed nothing landed in
  `DONE` as if it were an answer, and one that came back as an error was retried
  until the attempts ran out. A refusal now ends with one line,
  `{"declined": "why"}`. The errand reads that line and goes from `WORKING` to
  `DECLINED` without another attempt, telling the operator the reason.
  Nothing the agent left in the tree is published. It is stashed under the
  task's id, with no commit, no branch and no hook involved, so a shared checkout
  reaches the next errand clean. `Git` grows `setAside(repo, label, workId)` for
  this.
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
- Updated dependencies [599b4bd]
- Updated dependencies [2363da5]
- Updated dependencies [0ef3ae3]
- Updated dependencies [0815efb]
  - @amykit/core@0.7.0
  - @amykit/plugin-file-queue@0.7.0
  - @amykit/workflow-pull-request@0.7.0

## 0.6.0

### Patch Changes

- 9e3cb22: What a private workflow had to write for itself, the shipped one now does.
  
  - A commit status GitHub returns in lower case reads as passing or failing; every one used to read as running.
  - `Git` commits without pushing, and `push` refuses anything that is not a fast-forward, naming the branch. `commitAndPush` is built on the two.
  - A review thread carries the file it is on.
  - The code host finds a pull request by the id in its title, open or merged, and the author's pull requests somebody asked to change. A workflow that claims no writes is handed `pullRequestAncestry` and both of these.
  - `ticket-to-qa` takes `policy.writes: operator`: every tracker and code-host write is said once, in the work's thread or through the notifier, and the machine waits until it sees it made. The workflow then claims no writes at all.
  - A ticket Linear labels into several repositories (`repoByLabel`) is one work item per repository, `TICKET@owner%2Fname`, and QA receives it once, when every one has merged.
  - `file-queue` takes `order: priority`: the most urgent due item first, first in first out within one priority, refreshed on every discovery from the tracker's own urgency.
- Updated dependencies [9e3cb22]
  - @amykit/core@0.6.0

## 0.5.0

### Minor Changes

- 98cc10e: **Breaking for workflow authors — one migration for two changes.**
  
  An action is declared once. `WorkflowRuntime.handlers()` and `Workflow.usesActions` are replaced by `WorkflowRuntime.actions`: a map whose keys are the actions the plan may emit and whose values run them — a handler, or `{ port, method }` for a method its port marked with the new `acceptsAction`, which the host calls with the action and its context and whose answer lands in `outcomes` under the action's name. The mount refuses at boot, by name, a key with nothing behind it, a port nothing mounted, a method the port lacks, or one that takes its own arguments rather than an action; the engine refuses a plan carrying an undeclared action before any of its actions run. A package still carrying `usesActions` or `handlers()` is refused with the sentence that says what to change.
  
  `apply` is told the move: `apply(record, plan, outcomes, observation, now, moved)`, where `moved` is `{ from, to }` for an advance and `null` otherwise. `record` has already moved, so where the work came from is `moved.from`, never `record.state`. `movedBy`, `runAction`, `implementationOf`, `undeclaredIn`, `unrunnable`, `mountedActions` and `mountedRuntime` are exported from the core.
  
  `ticket-to-qa` now resumes an answered escalation in the state that raised it — implementing, the gate, an automated or human fix, or reviewer assignment — instead of always in `HUMAN_FIX`, and starts its attempt counters again when it does. `@amykit/workflow-testkit` takes a `ports` option for actions declared as a port and a method, and `amy workflow new` scaffolds the new shape.

### Patch Changes

- f259468: A workflow now declares the code-host writes it may make, and the mount gives its runtime capability-limited tracker and code-host ports. `amy doctor` reports the selected workflow's external write surface, including tracker/code-host read-only installs.
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

## 0.3.1

### Patch Changes

- Updated dependencies [4b54a6f]
  - @amykit/core@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [e603b3b]
  - @amykit/core@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [b53de08]
- Updated dependencies [eb5214d]
- Updated dependencies [f9944f6]
- Updated dependencies [76692e1]
- Updated dependencies [353d361]
- Updated dependencies [2b6bde3]
- Updated dependencies [a97c34d]
- Updated dependencies [0b5e3d8]
- Updated dependencies [616f7e6]
  - @amykit/core@0.2.0

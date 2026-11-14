# @amykit/cli

## 0.8.0

### Minor Changes

- 4303f6f: **A profile keeps its own config.** Each profile may keep a `config.yaml` and a
  `.env` of its own under `profiles/<name>/`, and reads the machine's files with
  its own over them: mappings merge key by key, a list or a scalar replaces the
  machine's value whole, and a profile with no file reads exactly as before.
  `workflows:` and `defaultWorkflow` stay in the machine's file, and a profile
  file naming either is refused at boot by name. Keys are read in one order —
  exported in the shell, the project's `.env`, the profile's, the machine's — and
  a loop started for one profile no longer inherits another profile's keys.
  `amy doctor` names every config and `.env` file it read, no longer fails a
  machine-wide slice another declared profile mounts (it names that profile), and
  fails a profile file no declared profile names.
- 9a9ac0a: **A skill is asked for in the chat.** Grooming needed a terminal: amy's skills
  lived only in a harness's own directory, and the chat knew three commands. Now
  `/amy-groom PROJ-1` works from Slack or Telegram, and the thread goes on.
  
  - **amy owns a copy of the skills it ships.** `amy skills` and every `amy
    update` write every shipped skill into `~/.amy/skills`, whether or not a
    harness directory was chosen; a harness's own directory stays an extra the
    person asks for. A root amy cannot write is a failed install naming it.
  - **A step looks a skill up in a fixed order.** `~/.amy/skills` first, then the
    roots the config names. `~/.claude/skills` is no longer looked in on its own:
    a harness's skills reach amy only through `harnessSkills`. The relay and the
    chat read the same order, so a skill the mount accepted is the one handed to
    the harness.
  - **A harness's own skills are linked, never copied.** `harnessSkills: {
    claude: true }`, top-level in `.amy/config.yaml` or under the relay's own
    settings (which win), links each skill of that harness into `~/.amy/skills`,
    one symlink per skill, at every `amy run`, `amy tick` and loop pass. `false`,
    or leaving the harness out, removes the links; amy's own copy of a skill wins
    over a link. The names are the harness plugins that mounted: the `Harness`
    port gains `skillsDirectory`, which claude (`~/.claude/skills`) and codex
    (under `CODEX_HOME` or `~/.codex`) report, and a name no harness plugin
    mounted is refused at boot.
  - **The conversation is a step in the skills ladder.** `skills: { chat:
    [/amy-groom] }` mounts, a chat skill that is not installed is refused at boot
    naming it and what is installed, and no other vocabulary names what the chat
    may run.
  - **A message that starts with a skill is an `/action` turn.** After a leading
    space or a bot's name, `/amy-groom <ticket>` is answered with the skill lent
    to the harness and its commands run; the thread keeps the skill until `/new`.
    A `/skill` the ladder does not name is answered with the ones it does, and
    nothing runs. The harness stays read-only in a skill turn: what acts is the
    `/action` list.
  - **A section with newlines arrives as a block, never a shell.** `brief
    sections --json` and `brief check --json` are read from the chat, and `brief
    write` takes `--explains` and `--from answer.md`, the fenced block in the
    same answer. The chat checks the block is there before anything runs, writes
    it to a file for the length of the command, and removes it after. `amy brief
    write` takes `--from <file>` too, so the same spelling works in a terminal.
  - **A skill turn needs a harness that can be handed one.** The `Harness` port
    gains `lendsSkill`, which claude sets: a chat addressed to a skill on a
    harness that cannot load it is refused, naming one that can, rather than
    acting without the method.
  - **The chat reads its ladder and its skills as the mount does.** A ladder
    written under the relay's own settings wins, as the operator's slice does at
    mount; the skill table is resolved every pass, so installing or deleting a
    skill needs no restart. `/new` in a thread ends the skill it was started
    with. `amy update` writes the skills on every successful run, moved or not,
    and `amy skills --recorded` leaves the own-root write inside `writeSkills`'
    rollback so a failed move restores the previous bodies. The skills are
    written before the boot check, so a deleted `~/.amy/skills` a chat skill
    needs is repaired by the update, and a moved CLI that does not boot has the
    rolled-back one write its own skills back.
  - **A skill turn checks its skill is still there.** A turn queued behind one
    whose commands removed the skill is refused, naming `amy skills`, rather than
    lent a directory that is gone. A block fenced with more backticks holds a
    three-backtick example whole, and a block that cannot be written leaves the
    turn to be asked again rather than settled.

### Patch Changes

- Updated dependencies [a41a17f]
- Updated dependencies [9a9ac0a]
- Updated dependencies [3a8cc7a]
  - @amykit/core@0.8.0
  - @amykit/agent-kit@0.8.0
  - @amykit/plugin-notify-fanout@0.8.0
  - @amykit/plugin-terminal-conversation@0.8.0
  - @amykit/model-specs@0.8.0
  - @amykit/services@0.8.0
  - @amykit/workflow-setup@0.8.0
  - @amykit/plugin-file-log@0.8.0
  - @amykit/plugin-file-notes@0.8.0
  - @amykit/plugin-file-queue@0.8.0
  - @amykit/plugin-file-store@0.8.0
  - @amykit/plugin-file-tasks@0.8.0
  - @amykit/plugin-serial-engine@0.8.0
  - @amykit/ui@0.8.0

## 0.7.1

### Patch Changes

- Updated dependencies [e79dea1]
  - @amykit/core@0.7.1
  - @amykit/agent-kit@0.7.1
  - @amykit/model-specs@0.7.1
  - @amykit/services@0.7.1
  - @amykit/ui@0.7.1
  - @amykit/workflow-setup@0.7.1
  - @amykit/plugin-file-log@0.7.1
  - @amykit/plugin-file-notes@0.7.1
  - @amykit/plugin-file-queue@0.7.1
  - @amykit/plugin-file-store@0.7.1
  - @amykit/plugin-file-tasks@0.7.1
  - @amykit/plugin-notify-fanout@0.7.1
  - @amykit/plugin-serial-engine@0.7.1
  - @amykit/plugin-terminal-conversation@0.7.1

## 0.7.0

### Minor Changes

- 938c702: **A brief is groomed from its sources.**
  
  amy ships an `amy-groom` skill: it reads the ticket and the code at a pinned
  base commit, then asks one question at a time until every requirement in the
  brief names its source — the ticket, a design actually opened, a decision
  somebody made — and cuts the rest, with the reason. It learns the brief's
  format and check from the workflow that judges it rather than carrying one,
  writes a local file, and writes nothing to the tracker, the code host or chat.
  Before, grooming a brief that a workflow holds tickets on had no skill in amy
  at all, and requirements nobody asked for were the defect it exists to stop.
- b761f29: **A config is typed by its schema.** `definePlugin` gives a plugin's register and ready hooks the post-validation type derived from its schema, rejects mismatched defaults, and moves every shipped schema onto that declaration. Scalar and `string[]` settings no longer cast away the host's validation; record settings remain explicitly narrowed where a plugin needs a stronger value shape.
- 2c7324c: **A mount builds once.** `port`, `engine` and `contribute` accept `deferred(() => impl)`: the host builds it once every plugin has registered, once per mount and before any `ready`, building on demand when one reads another, so the order plugins are listed in does not matter. A build that throws is a boot refusal naming its plugin, and two builds that read each other are refused naming both. The agent relay, the serial engine and the three shipped workflows use it in place of their own `WeakMap<PluginContext, …>`, getter proxies and build-early `ready`. One behaviour change: the serial engine is now built at boot, so an engine with no workflow, no runtime or no queue, store or notifier is refused when the host mounts rather than on its first tick.
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
- adb614e: A plugin is installed into a workflow, as a package or as a fork of its source.
  
  `amy add <package> --fork` takes the package's source from the repository its
  `package.json` names, at the tag its installed version was released under, into
  a place the selected profile owns: under `forks/` in the project of a workflow of
  your own, or under `~/.amy/profiles/<profile>/forks/` for one somebody else
  published. A git URL naming a directory (`<url>#path:<dir>`) forks the same way
  without the registry. The fork keeps the package's name, and a profile root of
  its own, `~/.amy/plugins/profiles/<profile>`, maps that name to it — so two
  profiles on one machine can answer one plugin two ways, an installed workflow
  that imports the name reaches the fork, and no config or code names a path.
  
  Before, one machine had one npm root, so a name resolved to one place for every
  profile, and the only way to change how a port was answered for one workflow was
  a second plugin shipped inside that workflow.
  
  An edited fork is built by its own build script on the next boot, and a running
  loop remounts it between ticks. `amy update` merges the plugin's next release
  into the fork three ways and keeps every edit; a line both sides changed stops
  the whole update before anything moves, with the marked merge written beside the
  fork. `amy remove` of a forked name goes back to the published package and keeps
  the fork's directory. `config.yaml` gains `add: fork | package` and `forks:`;
  `--fork`, `--package` and `--to <dir>` override them for one command.
  
  `amy workflow add --into` now copies a callee's source from its repository at the
  installed version, rather than the compiled `dist` it was installed as. Every
  published package also ships a shadcn registry item under `registry/`.
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
- 2b4deec: **A run carries only what amy hands it.** The three agent CLIs amy drives used to carry the operator's own setup into a ticket run and write back into it. Now each run is kept apart:
  
  - **Claude** runs with `--setting-sources project,local --strict-mcp-config --no-session-persistence`. The operator's `CLAUDE.md`, hooks, plugins, MCP servers and skills stay out, and no session or auto-memory is written under `~/.claude/projects`. The repository's own settings still load. A step whose skill ladder names a skill is lent that one skill through `--add-dir`, and nothing else of the operator's.
  - **Codex** runs with `--ignore-user-config --ephemeral --disable hooks --disable plugins --disable apps --disable memories`. The login still comes from `CODEX_HOME`, and `~/.codex/AGENTS.md` and user skills still load, since Codex has no switch for them.
  - **Hermes** runs in its own profile, `hermes -p amy`, set by the new `profile` setting. `amy init` and `amy add` create that profile from the active one when it is missing, with memory, unasked skill writes and the curator turned off. `amy doctor` goes red, naming the fix, when the profile is missing or has any of those turned back on.
  
  **A plugin can prepare something outside amy's state.** `Plugin.setup` is run by `amy init` and `amy add` after a plugin's files. A setup gets the plugin's settings and a command runner, answers the way a check does, and one that throws is reported without stopping the next. `AskContext.skill` carries the skill a relay addressed the prompt to, with the directory it is installed in.
- 6091a45: **A view is data.**
  
  amy is going to have a window — a terminal, a browser, eventually a phone —
  with plugins changing what is in it. A plugin that exports React components
  renders in one of those and none of the others, cannot reach a phone that
  installs no npm packages, and brings a second copy of React into somebody's
  window. So a plugin does not render: it describes, and the renderer draws.
  
  - A new package, `@amykit/ui`, with no dependencies: a closed vocabulary of
    seventeen semantic primitives, checked so a name outside it — or any
    property value that is not JSON — is refused by name; a JSX runtime
    (`jsxImportSource: "@amykit/ui"`) that returns a tree of plain data with
    no React anywhere; `diff` and `patch` between two trees; `validate` for a
    tree that arrived as data; `catalogue()`, the vocabulary as JSON Schema
    components; and `renderText`, a deterministic text renderer.
  - A button's `intent` is `{ action, args }`, never a closure, so it survives
    a socket.
  - `amy status` is a view of the snapshot `amy status --json` prints, drawn by
    the text renderer. Its output is what it printed before, byte for byte.
  - A new local rule, `L0.A_VIEW_DRAWS_NOTHING`: no package or plugin source
    imports React, Ink, Preact, Vue, Solid or Svelte, or compiles its JSX
    against one.
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
- 65ebf9f: **A workflow is its diagram, its decisions and its actions, and nothing else mounts.** `defineWorkflow` takes only the three pieces: `decide`, one pure decision per state the `workflow.mmd` beside it draws, with `before`, `after`, `discover`, `observe`, `actions`, `remember` and `progress`. A declaration that still passes a single `plan()` or a `runtime()` factory is refused at boot, naming each and where it moved, and `states`, `waiting` and `terminal` are gone: a declaration still passing them is refused by name, and one whose host found no `workflow.mmd` beside its entry or at its package root is refused at mount, naming the workflow and the file. Before, both forms and both sources of states mounted side by side, so the boot check of one decision per drawn state applied to some workflows and not others, and the same fact could live in a list in code that nothing held to the drawing. The CLI now mounts only declarations: a plugin it loads from an install or from `~/.amy/workflows` that registers a workflow by hand with `registry.workflow(...)` is refused naming the plugin (`declaredWorkflowsOnly` in the core). Because every installed workflow now imports the core it is declared with, a package added by path is installed into amy's root as a copy with its dependencies (`--install-links`) and probed from there, rather than linked to a directory where its imports do not resolve. `amy workflow new` writes the three pieces each in its own file — `workflow.mmd`, `decide.ts`, `actions.ts` — joined by the one call in `index.ts`, with no runtime factory, and its suite mounts the workflow the way amy does. `defineWorkflow` also carries a plugin's `setup` and `environment`.
- 8b21570: **A workflow runs on lanes.** A diagram may draw `state X <<fork>>` and
  `state Y <<join>>`: every line out of the fork is a lane, every lane is a
  call, so a record of its own, and the caller moves to the join once every
  lane has ended, holding where each ended and what it returned, keyed by lane.
  There is no setting for how many: the number of lanes is the number of lines
  drawn. Before this, work that could run side by side ran one piece after the
  other, or was written by hand in a runtime the diagram never showed.
  
  A lane that escalates leaves its siblings running, and the fork says which
  lane needs the person — in its wait, in `callStanding`, and in `amy status`,
  which draws the lanes side by side. A lane takes a lease on the branch it
  writes before it checks it out, and a branch another lane holds is a wait that
  costs no attempt. A binding's `revision` lends a lane a tree detached at the
  caller's commit, read-only. Refused at boot, by name: a lane that is not a
  call, a lane that never reaches its join, a join no fork meets at, a decision
  written for a fork, and two lanes bound to the same literal branch.
  
  `@amykit/plugin-concurrent-engine` is the serial engine with the lanes of a
  fork moved at once, each asked of the budget before its call. The serial
  engine stays the default, and moves them in turn.
  
  **`ticket-to-qa` runs its gate and its self-review as two lanes.** `CHECKED`
  and `SELF_REVIEW` are gone: a finished implementation goes to `checks`, where
  the gate and the review both check the implementation's commit, and meet at
  `verdict`. A change either one refuses goes back to the implementation with
  what both said, in one round — before, a change the gate refused went back
  without what the review would have said, and the review never saw the rules
  the gate holds. The review now ends on a verdict: a line saying
  `CHANGES_ASKED` sends the work back, anything else approves. The rounds count
  toward `maxGateAttempts`. A record an older version saved in `CHECKED` or
  `SELF_REVIEW` goes straight to `checks` on its next look and is checked again
  in both lanes, without implementing again. A ticket that leaves its repository
  while it is being checked stops where it is, as it did in `CHECKED`.
- d85dacd: **A workspace is a capability.** Nothing is handed a workspace without asking: plugins borrow their checkouts through a `workspace` port the file-worktree plugin mounts, and workflows inherit them from their support, so a machine that works nowhere in particular needs none. The seven machine keys — `repos`, `workspaceRoot`, `checkouts`, `defaultBranch`, `baseBranch`, `gate` and `worktrees` — are read from the plugins whose slices carry them (`plugins: "@amykit/plugin-file-worktree"` for the six workspace keys, `plugins: "@amykit/plugin-command-gate"` for the gate). The doctor asks about checkouts, worktrees, `gh` and `git` only where a workspace was mounted, so a machine that drives no code — a support inbox, say — is told it is ready, and `amy update` moves an old install's keys under those slices, saying each move, keeping the original beside the config, and refusing a key put back at the top level by name. The provenance of every derived slice, now a property with its own falsifier (`machine_key_leaks_into_a_slice`).
- c7cd07a: **amy answers in the chat.**
  
  A message in the Telegram private chat outside every topic, or a root message
  in the Slack channel, is answered there. A plain message is an ask: the
  harness runs read-only, under its own sandbox or not at all, and nothing it
  names runs. A message starting with `/action` lets that turn act on amy: the
  commands its answer names in a fenced `amy` block run as amy with arguments,
  never a shell, and one off the fixed list refuses the whole block. `/new`
  starts another conversation in a chat without threads, `/harness <name>`
  switches the harness mid-conversation, and every turn sends the conversation
  whole. A long turn's progress is one message edited in place. A conversation
  is not work: its agent runs are held to no budget ceiling and kept out of the
  ledger, unless `chat.budget: true` asks for them to be counted.
  
  `config apply` writes a new `config.yaml` from the chat, shown as a diff,
  only when it mounts in a child first. `restart` lets a new mount through only
  when it boots, and the new loop says its pid in the chat. A loop whose
  workflow does not mount still answers in the chat and names the failure.
  
  `amy start` now starts the loop under the machine's supervisor — launchd on
  macOS, systemd --user on Linux, Task Scheduler on Windows — which starts it
  again when it dies; `amy stop` removes it so nothing does. `--detached` keeps
  the old behaviour, which is also what a machine with no supervisor gets.
  `amy doctor` names the supervisor in use and refuses a Linux user with
  lingering off.
  
  The core exports the chat's pieces (`answerTheChat`, `addressed`,
  `ChatProgress`, `Transcripts`, `commandsIn`) and `Conversation` gains optional
  `threads`, `edit`, `chat`, `settle`, `say` and `revise`. Telegram takes
  `topics: false`, where works share the private chat and a reply reaches one by
  quoting amy's message for it or starting with its id.
- f062bea: **Grooming reads the sections its workflow declares.**
  
  A workflow declares the brief it asks for — `brief: { sections, check }` in
  its `defineWorkflow` — and amy judges a brief against it: `amy brief sections`
  lists what to answer, in order (in a project, the brief's own sections, then
  each later phase's, a `prove/` scenario included); `amy brief write <id>
  <section>` answers one through the brief port; and `amy brief check <id>`
  exits non-zero while any phase's check, or a declared section left blank,
  refuses it, naming the phase, the section and the rule. A check is handed
  every operation the mounted plugins offer, so a scenario naming one nothing
  offers is refused. `amy doctor` reports a brief phase that exports no check
  rather than passing it.
  
  `amy-groom` now asks the sections the workflow declares, one question at a
  time in the order the check names them, and stops when it is green. Before, a
  brief's readiness was judged only inside each workflow's code, with no
  command to ask it, and the shipped skill asked questions of its own.
- 5c705d2: Harness subscriptions report their account-usage windows through `amy status` and `amy budget`.
- 3649573: Plugin versions and unused workflow observer declarations were removed; package manifests supply displayed versions.
- 79a3fbd: **Setup is a workflow.**
  
  `amy init` wrote a template and left the person to it. `amy setup` asks, one
  question at a time, and is itself an amy workflow drawn in Mermaid: which
  harness should do the work (the ones detected on this machine offered first),
  which workflow it should drive, which channels should reach you — installing
  only what was chosen, asking each chosen plugin's settings one field at a
  time with the value the machine already holds offered as the default, and
  checking what it configured before it says it is done. `amy setup <plugin>`
  goes straight to configuring that one plugin. With no terminal to answer an
  ask, the walk stops on the question and prints the flag that answers it, so a
  pipeline can say it all at once. The old `amy init` is gone, alias included, and
  `amy setup <workflow>` writes the workflow's own files — the ticket workflow's
  roster — into the profiles that mount it. The terminal it asks in ships as
  `@amykit/plugin-terminal-conversation`, so the window can draw the same asks
  later with no change to the workflow.
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
- 2363da5: **The host lends the checkout.** `PluginContext` gains `checkouts()`, which answers with the `Git` and the layout for the calling plugin — the host's paths, the plugin's own `defaultBranch` and `baseBranch`, and the `worktree` port read whenever a path is asked for, so a worktree plugin listed after the caller is still the one used. The core exports `BRANCH_SETTINGS`, the two branch settings with one description, and every shipped schema that declares them spreads it in place of its own wording. The command gate, the plan check and the three workflows that opened pull requests ask their context instead of building a `Git` and a second copy of its layout. The settings stay per plugin, so no `config.yaml` changes; the plan check's `baseBranch` now defaults to `{}` like every other's.
- 0ef3ae3: **The roster belongs to its workflow.** The team list that names who reviews
  and who owns QA is one ticket-to-qa profile's file, written by `init` and
  `add` beside the profile's records and confirmed by `amy roster confirm` —
  the workflow brought its command and its check with it, and none of the
  host's source names the file any more. Where a profile has no roster of its
  own, the workflow's red check names the file the machine kept where the
  roster used to live, so the error is a way back and not a dead end.
  
  `amy update` now gives an existing install its move: every team an older
  release kept at `~/.amy/roster.yaml` is copied into each profile that mounts
  the workflow, the old name is retired as `roster.yaml.moved` rather than
  deleted, and a second update changes nothing.
  
  The doctor asks the machine, and only the machine: a gate's commands are
  asked of the machines that mounted a gate, and each mounted plugin names the
  environment variables it reads — `plugin.environment` — so the errand's
  machine is green without the ticket workflow's tracker key, and no install
  carries a credential checklist nothing on it asked for. The quickstart walks
  the shape the machine has now: init, add a workflow, doctor, start.

### Patch Changes

- cea9b94: **A lock is taken one way.**
  
  The core exports `takeLock` and `processAlive`. A lock is a file naming its
  owner, published whole, so a lock being taken is never read as one its owner
  abandoned; one whose owner died, or whose lease ran out unrenewed, is taken
  over through a tombstone only one process can create, so of everyone who saw
  the same dead owner exactly one removes it. A process that dies in the middle of
  that leaves its tombstone, swept within the hour, and only then is the lock
  buried again: finishing sooner could let two finishers remove a new owner's
  lock. A lock an earlier version left —
  a pid line, a `pid:token` line, a bare token or a directory holding
  `owner.json` — is read and recovered the same way.
  
  The daemon boundary, the config `/action` applies, a chat message's claim and
  the proof's lease lock all take it, and nothing else asks whether a process
  lives. The daemon boundary no longer removes a lock another process had
  opened and not yet written its pid into.
- ebae48c: **A reply in a work's thread can be a question, not only an answer.**
  
  When `ticket-to-qa` escalated, or asked a question before starting, the owner's
  first message in the thread ended the wait and the work resumed on it. A person
  who replied "why do you think that comment is wrong?" had not decided anything,
  and watched their question turn into work.
  
  - `Reply` gains an optional `kind`, `discussion` or `decision`, set only when
    the person marked the reply. The catalogue gains `discuss`, on the `agent`
    port, so it is charged to the budget like every other run.
  - `policy.conversation` on `ticket-to-qa`: `answer`, the default, reads a reply
    nobody marked as the decision, exactly as before. `discuss` reads it as a turn
    in a discussion: answered in the thread, read-only, with no state change, no
    commit and no attempt counted, while the work waits for a reply marked as the
    decision. A marked reply reads as marked under either. An unknown value is
    refused at boot by name.
  - `AskContext` gains `readOnly`, and a discussion is asked with it. The
    harness enforces it rather than the prompt: Claude runs with
    `--permission-mode plan`, Codex with `--sandbox read-only`, and Hermes, whose
    one-shot mode cannot keep its tools off the checkout, refuses the run so a
    relay hands it to a harness that can.
  - On the decision, the step the work resumes is prompted with the whole
    discussion, attributed, with the decision last.
  - The Slack plugin marks a reply by the operator's own reaction on it: ✅
    (`white_check_mark`) decides, 💬 (`speech_balloon`) discusses. Both names are
    settings, `decisionReaction` and `discussionReaction`. A reaction Slack lists
    only in part is read again in full with `reactions.get`, which needs the
    `reactions:read` scope; without it, that one read fails and says so.
  - Without a conversation port, a comment on the ticket is still the decision,
    whatever the policy says.
- 843cee0: `amy update`, and the rollback it runs when a move fails, install into the
  plugins root with `--install-links`, the way `amy add` does. Before, they
  installed without it, so updating any other package could turn a workflow
  copied in from a path back into a link. A linked workflow's `@amykit/core`
  import resolves from outside the plugins root, and the workflow failed to load.
- The `amy-workflow` skill teaches the three pieces a workflow is, Mermaid, Act
  and Decide: a `workflow.mmd`, a `decide` map with one pure decision per drawn
  state, and `actions` written against the `scope` they are handed. Before, it
  taught a `plan()` with a runtime beside it and a raw plugin registering states
  by hand. Neither of those mounts any more, so a person following the skill
  wrote a workflow amy refuses. The two opinions amy holds every workflow to,
  MAD and BEP (Brief, Execute, Prove), are written down in *MAD and BEP* under
  How it works.
- bec4225: `amy update` reaches the release. It said `nothing to move` with 0.6.0 published to a machine on 0.5.0, for two reasons ([#110](https://github.com/nicolasmelo1/amy/issues/110)):
  
  - **A 0.x caret never crossed a minor.** Every `@amykit/*` package now moves to one release, asked once of the CLI's registry intent (`latest` unless the operator wrote another), whatever caret npm saved, and each manifest entry then names it as `^<release>`. Third-party packages still move only within the range the operator wrote, so a 0.x workflow at `^0.1.0` stays on 0.1.0. To hold the machine below a release, set `amyUpdateRanges["@amykit/cli"]` in `~/.amy/plugins/package.json`; `--check` names that pin and the release it holds you below, where it used to say `nothing to move`.
  - **A CLI installed with `npm install -g` read as a checkout.** The global prefix is now an install root, on Unix and on Windows. The CLI moves there with `npm install --global`, and when a plugin in the release refuses to import, every move rolls back, the CLI included.
  
  The `amy-update` gate stubbed out both of these with a stand-in npm that answered whatever it held. It now runs real npm against a registry on a loopback port, with the CLI installed globally.
- a723ac8: The mutation fixtures `amy workflow new` writes beside a workflow are TypeScript now, the same as the scaffold they guard. Two of the three were still `index.js`, so a workflow written in TypeScript proved its guardrails against a file in a language it does not use. The rules read both, so `sf verify` in an existing workflow is unaffected.
- 69dfe62: **The chat recovers, pays and reads fairly.**
  
  When the workflow does not mount, the chat's recovery grows one group of
  plugins a mount at a time instead of trying every subset, and keeps a
  thread-only adapter out of the way of one that can answer in the chat. Under
  `chat.budget` with a dollar ceiling, `/harness` no longer offers a harness
  whose turns nothing can price. A config lock left by a dead writer is cleared
  under a guard named after the owner that was seen dead, so a writer acting on
  an old look never removes a replacement. In Slack, work-thread reads no
  longer hold the chat's follow-ups unread: the chat reads by its second minute
  at the latest.
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
- 67ca0be: **The README now derives its mutable facts from the code and policy that own them.**
  
  The published command declares its Node requirement to npm. The README's Node
  badge, command table and factory counts are generated with the rest of the
  documentation, so `npm run docs:check` names the README when one falls behind.
- b0f2991: The declaration the `amy-workflow` skill shows declares `policy.maxAttempts`
  in its `configSchema`, with the same default its policy reads. Before, it left
  the schema empty, and the mount refuses a policy key the schema does not
  declare, so a workflow copied from the skill did not boot.
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
- Updated dependencies [6091a45]
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
- Updated dependencies [5c705d2]
- Updated dependencies [3649573]
- Updated dependencies [79a3fbd]
- Updated dependencies [f4069bb]
- Updated dependencies [09cb74f]
- Updated dependencies [f9b65f6]
- Updated dependencies [37504c1]
- Updated dependencies [b17f2af]
- Updated dependencies [2363da5]
- Updated dependencies [0ef3ae3]
- Updated dependencies [0815efb]
  - @amykit/core@0.7.0
  - @amykit/plugin-file-notes@0.7.0
  - @amykit/plugin-file-queue@0.7.0
  - @amykit/plugin-file-store@0.7.0
  - @amykit/plugin-file-tasks@0.7.0
  - @amykit/plugin-serial-engine@0.7.0
  - @amykit/agent-kit@0.7.0
  - @amykit/ui@0.7.0
  - @amykit/services@0.7.0
  - @amykit/plugin-notify-fanout@0.7.0
  - @amykit/workflow-setup@0.7.0
  - @amykit/plugin-terminal-conversation@0.7.0
  - @amykit/model-specs@0.7.0
  - @amykit/plugin-file-log@0.7.0

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
  - @amykit/plugin-file-queue@0.6.0
  - @amykit/model-specs@0.6.0
  - @amykit/plugin-file-log@0.6.0
  - @amykit/plugin-file-notes@0.6.0
  - @amykit/plugin-file-store@0.6.0
  - @amykit/plugin-file-tasks@0.6.0
  - @amykit/plugin-file-worktree@0.6.0

## 0.5.0

### Minor Changes

- c1edd17: Add a Slack adapter for the conversation port: one thread per piece of work over the Web API, operator-only replies with downloaded files, `Retry-After` backoff, and `amy doctor` checks for the token, channel and scopes.
- ab6db01: `classify` turns a plugin spec into what npm installs and what the config names — a name, a range, a git URL, a tarball or a path — in one place, before `amy add`, `amy remove` and `amy update` arrive.
- f9cdd5e: `@amykit/workflow-testkit` is new: `conforms(workflow, { runner, runtime, worlds })` registers the machine-shaped suite every workflow needs and nobody writes — every state reached and left, every planned action handled and surviving the call, no wait counted as a try, no decision made by `[].every(...)`, and no giving-up state without an honest way out — as ordinary tests in whichever runner it is handed, driven against worlds the author supplies. `amy workflow new` now writes that suite beside the scaffold as `index.test.js`, with `npm test` and the kit as a dev dependency, and the scaffold's `index.js` exports its `workflow` and a `runtime()` factory beside the plugin.
- 20acbac: `amy workflow new` writes an editable workflow under the machine state home, and `amy workflow check` drives its lifecycle before it reaches real work.
- 156cd65: New `amy add` and `amy remove` commands: one argument — a package name, a URL, a git URL or a path — installs the package into `~/.amy/plugins`, mounts it alone to decide whether it is a workflow or a plugin, writes the config entry (a profile for a workflow, the machine-wide `extraPlugins:` list for a plugin), and refuses what the machine would not survive instead of leaving a half-added entry behind. Plugins added this way join a profile without freezing its recommended set into the config.
- 0e72167: New `amy update` command: moves a machine forward without leaving it half-updated — reads both roots (the plugins root and the one that resolved the CLI), re-resolves every registry range through npm, installs the exact version each range now points at, and keeps the manifest's ranges the way the operator wrote them. Refuses while the loop is running; a version that will not import or mount is rolled back to the one that did; a config that will not boot fails the update and rolls back every move; and when the CLI itself moves, its skills are rewritten into the harnesses they were written into before — through the new CLI, never the old process. `amy skills` now records where it wrote, and `--recorded` rewrites into exactly those places.
- edac5f4: Schedule `amy update` around workflow invocations with a persisted per-profile cadence. The default updates before every twentieth invocation; operators can run after, disable it, and receive an early refusal for invalid schedule settings. Daemons update only before their child starts or after it exits.
- 9bb3d24: Park an opted-in workflow before it spends another agent run with no new evidence.
- 13e5372: Plugins configured for an amy install now live in `~/.amy/plugins`: `amy init --install` installs them through that root rather than npm's global prefix, and mounting plus `amy plugin list` resolve from the same root.
- eba8d66: `amy workflow new` now writes TypeScript: `index.ts` typed against `@amykit/core`, run unbuilt by Node 22.18 or later from `~/.amy/workflows`, with a `tsconfig.json` and `build`/`typecheck` scripts that compile `dist/` for publishing, since Node refuses TypeScript under `node_modules`; the suite is `index.test.ts`. A local workflow that is still `index.js` keeps resolving. It also writes a `.software-factory/` beside the scaffold: three repo-local rules that `sf check` in the workflow's directory enforces — no `checkout -B`, which loses a commit that was never pushed; no fold reading `.state` off the record the engine already moved; and no `.every(` that does not say what an empty collection means — with one mutation fixture each, so `sf verify` there proves every rule still fires. amy does not install `sf`, and `sf` learns nothing about amy: they are ordinary local rules.
- 98cc10e: **Breaking for workflow authors — one migration for two changes.**
  
  An action is declared once. `WorkflowRuntime.handlers()` and `Workflow.usesActions` are replaced by `WorkflowRuntime.actions`: a map whose keys are the actions the plan may emit and whose values run them — a handler, or `{ port, method }` for a method its port marked with the new `acceptsAction`, which the host calls with the action and its context and whose answer lands in `outcomes` under the action's name. The mount refuses at boot, by name, a key with nothing behind it, a port nothing mounted, a method the port lacks, or one that takes its own arguments rather than an action; the engine refuses a plan carrying an undeclared action before any of its actions run. A package still carrying `usesActions` or `handlers()` is refused with the sentence that says what to change.
  
  `apply` is told the move: `apply(record, plan, outcomes, observation, now, moved)`, where `moved` is `{ from, to }` for an advance and `null` otherwise. `record` has already moved, so where the work came from is `moved.from`, never `record.state`. `movedBy`, `runAction`, `implementationOf`, `undeclaredIn`, `unrunnable`, `mountedActions` and `mountedRuntime` are exported from the core.
  
  `ticket-to-qa` now resumes an answered escalation in the state that raised it — implementing, the gate, an automated or human fix, or reviewer assignment — instead of always in `HUMAN_FIX`, and starts its attempt counters again when it does. `@amykit/workflow-testkit` takes a `ports` option for actions declared as a port and a method, and `amy workflow new` scaffolds the new shape.

### Patch Changes

- 9c0d769: `findPrivateReferences` reads a tree against a policy of hashed terms, so the repository gate can refuse a private name — standing alone or glued into a longer identifier — without the list of forbidden names being published alongside the check that hides them.
- b8c781a: Let a project keep three phases — `brief/`, `workflow/`, `test/` — that share briefs while keeping state and spending isolated. Every such folder is a phase, a lone `workflow/` included, so its state moves under the project key and nothing is kept from an old profile of the same name. Each phase keeps its own tasks and Slack threads, `amy brief` names the missing `brief/` when a project has none, and `amy stop` signals only the selected phase's daemon without touching the shared handbrake.
- dbd5f0c: `amy doctor` and `amy plugin list` resolve a workflow of your own the same way mounting does, so `amy plugin list` no longer reports a directory written by `amy workflow new` as `FAIL`, and doctor validates its settings against the schema it declares.
- f259468: A workflow now declares the code-host writes it may make, and the mount gives its runtime capability-limited tracker and code-host ports. `amy doctor` reports the selected workflow's external write surface, including tracker/code-host read-only installs.
- 75e1f57: **Breaking for anyone who implements or calls the agent, the gate or a ticket. It ships in the same release as the workflow contract change, so you migrate once.**
  
  The core's contracts carried one workflow's lifecycle into every workflow:
  - The agent port had `triage`, `implement` and `addressThreads`, each taking a `Ticket`.
  - The agent prepared branches, committed and pushed by itself.
  - The gate took a whole `Ticket` to find a directory.
  - `Ticket` required Linear's `branchName` and `team`.
  - The core prescribed a pull-request title.
  
  A workflow that pushed once per cycle had to replace the checkout to get that decision back.
  
  - **`Agent` is `ask(prompt, cwd, context)` and nothing else.** It lives in `ports/Agent.ts`, beside `AttemptOutcome` and `Progress`.
    - The catalogue keeps `triage`, `implement` and `address-threads` as action names, so ladders, skills and budgets keyed on them are unchanged. Each now dispatches to `agent.ask`.
    - Build a step on `ask`, or with the new `implementStep` and `judgeStep` from `@amykit/agent-kit`.
  - **`AskContext` gains an optional `verify`.** A relay calls it after each run that completed, so a step can turn a completed run that did not hold into `failed` while the ladder can still climb. `implementStep` commits there, so a rung that changed no file still hands the step to the stronger model or the next skill.
  - **`implementStep` commits only through a `commit` function its caller passes.** No agent touches git any more: `HarnessAgent`, `NamedAgent`, `AGENT_COLLECTION` and the `git` and `agent` options of `contributeTiers` are gone.
    - A harness plugin contributes its CLI to `HARNESS_COLLECTION` and nothing else.
    - The claude, codex and hermes-agent plugins no longer take `defaultBranch`, `baseBranch`, `checkouts` or `reviewerHints`.
  - **A `config.yaml` that set `defaultBranch`, `baseBranch`, `checkouts` or `reviewerHints` under `plugins:` for a harness is now refused at boot**, naming the key. Delete it. A harness is never told where the work lives, and `reviewerHints` belongs under `agent:`.
  - **`AgentRelay` is gone.** The relay mounts the `agent` port as `ask` over `HarnessRelay`, with the same skill and harness ladders, the same budget and the same boot refusals.
  - **`Gate.run` takes a `Workplace`**, which is `{ repo, workId }`. It lives in `ports/Gate.ts`. `CommandGate` runs in `pathFor(repo, workId)` as before.
  - **`Ticket.branchName` and `Ticket.team` are optional.** ticket-to-qa refuses a ticket without a `branchName` on its first look, naming the field.
  - **`pullRequestTitle`, `TriageOutcome` and `ThreadVerdict` moved to `@amykit/workflow-ticket-to-qa`**, which now owns its prompts:
    - prompts: `triagePrompt`, `implementPrompt`, `threadPrompt`;
    - readers: `readTriage`, `readVerdicts`;
    - helpers: `branchOf`, plus the `TicketGit` type for the part of `Git` it drives.
  - **`agent.reviewerHints` in `config.yaml` stays where it is.** It now reaches ticket-to-qa's review prompt instead of every harness plugin.
  
  Eight local rules in `.software-factory/rules/` hold these decisions, and `docs/design/an-agent-only-answers.md` records them.
- dbd5f0c: The config template and the `/amy-workflow` skill say that a workflow of your own lives in `~/.amy/workflows`, instead of naming `amy add`, a command nothing ships, and telling a harness to install a package it does not need.
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
  - @amykit/plugin-file-worktree@0.5.0
  - @amykit/plugin-file-queue@0.5.0
  - @amykit/model-specs@0.5.0
  - @amykit/plugin-file-log@0.5.0
  - @amykit/plugin-file-notes@0.5.0
  - @amykit/plugin-file-store@0.5.0
  - @amykit/plugin-file-tasks@0.5.0

## 0.4.0

### Minor Changes

- 2388a13: `amy status` stops listing work that has finished.
  
  A record in a terminal state is done: `discover` already refuses to queue it,
  so it costs nothing to keep — but it never left the listing on its own, and a
  list that only grows stops being read. Finished records are counted below the
  table instead, `amy status --all` prints them, and `--json` marks each record
  with `finished` so a page can make the same cut. Nothing is deleted and the
  log still keeps what the work did.
  
  Nothing is hidden when the workflow will not mount, because a mount that
  failed is exactly when somebody wants every row.
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
- 2dc9117: A brief reaches every ticket it explains.
  
  Tickets may inherit a shared brief from their Linear parent. The workflow reads
  that brief freshly on every observation, carries it to triage, implementation,
  review and its self-review half-step, records questions against it, and keeps a
  brief only while its explained work remains non-terminal or inside retention.
  `amy brief <id>` renders the mounted brief without exposing its store path.
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
  - @amykit/plugin-file-worktree@0.4.0
  - @amykit/plugin-file-store@0.4.0
  - @amykit/model-specs@0.4.0
  - @amykit/plugin-file-log@0.4.0
  - @amykit/plugin-file-notes@0.4.0
  - @amykit/plugin-file-queue@0.4.0
  - @amykit/plugin-file-tasks@0.4.0

## 0.3.1

### Patch Changes

- 4b54a6f: Stop commenting machine notices on the tracker, and stop counting cache reads
  against the token ceiling.
  
  Two defects that both made the machine lie to its operator, found on the same
  day on the same install.
  
  **`notify.tracker: false` was dead configuration.** `plugin-linear` contributed
  its notification channel unconditionally and never read the setting, so every
  engine notice was commented on the Linear ticket — under the operator's own
  name, because amy authenticates with a key issued to a person, and with no
  prefix or marker because the channel posted the raw announcement text. `PROJ-7716
  is moving again in DONE after 2 failed attempt(s)` reached a real ticket and a
  colleague replied to it asking what it meant. The channel is now contributed
  only when asked for, the default is off, and what it writes says a machine
  wrote it on the first line.
  
  **One agent run could park the machine for five hours.** The token ceiling
  summed `input + output + cacheRead + cacheWrite`. A single implement run
  reported `input: 44, output: 17394, cacheRead: 1839757, cacheWrite: 92769` —
  1,949,964 against a 2,000,000 per-five-hours ceiling, from a run that cost
  $0.91 against a $20 ceiling in the same window. A cache read is the saving,
  not the spend, so the better prompt caching worked the sooner the machine
  locked itself out. The ceiling now counts billable tokens; `costUsd` remains
  the ceiling that knows what cache is worth.
- Updated dependencies [4b54a6f]
  - @amykit/core@0.3.1
  - @amykit/model-specs@0.3.1
  - @amykit/plugin-file-log@0.3.1
  - @amykit/plugin-file-notes@0.3.1
  - @amykit/plugin-file-queue@0.3.1
  - @amykit/plugin-file-store@0.3.1
  - @amykit/plugin-file-tasks@0.3.1

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
- 7ec6c02: Nothing is installed by default: the command arrives alone, the first workflow is the one the person there names or writes.
  
  `@amykit/cli` depends on no workflow and no notifier. The roster the ticket workflow reads is contributed by the host under the name the workflow looks up — spelled where the file is read, not imported — and whether a Hermes target is reachable is asked of the `notify` port the mounted channel contributes.
  
  `SHIPPED_PROFILES` is empty: a config with no `workflows:` block drives nothing, and every command that needs one says so and names `amy workflow new` and `amy add`. `EXAMPLE_CONFIG` keeps the two published workflows as commented examples, its plugin slices commented with them, and `amy init` writes its files and installs nothing. A machine with nothing mounted is still diagnosed: `amy doctor` reports everything it can see and names the missing workflow in the selection's own words.
  
  New gate `bare-install`: the scenario installs the command alone onto a machine with none of it and proves what it can and cannot do — twelve assertions, from "the command arrives alone" to "doctor asks the port, not the package".
- a0ec22e: The settings `amy init` writes assemble into a machine that boots — and the
  check that says so runs from the gate, not from a memory of a real install.
  
  `EXAMPLE_CONFIG` shipped `claude:opus` in the default ladder and again in a
  step's own. `everyLadderEntry` unions the default ladder with every per-step
  one and does not dedupe, so `tiersFor` produced `["sonnet", "opus", "haiku",
  "opus"]`, `contributeTiers` contributed a second agent named `claude:opus`, and
  the second one met the collection's one-name rule at mount. `amy init` wrote a
  config its own first `amy doctor` refused, and the workaround — deleting the
  per-step ladder the template exists to teach — configured the feature out of
  an install because of a missing `Set`.
  
  The union dedupes in one place, `contributeTiers`, preserving first-seen
  order: a ladder is ordered and the first mention is the one that means
  something.
  
  And the template check grows the claim it was always about: `npm run
  check:config` now assembles the settings the template ships — the same `load`,
  the same `pluginList`, the same `mount` a real boot runs — and refuses a
  template whose machine does not start.
  
  Nothing being installed by default, the template's `workflows:` block is a
  commented example, so the check mounts the settings under the workflow that
  example names: the machine the operator has one uncomment later. That is where
  the ladder, the budget, the gate and the skills actually meet a `mount`, and
  where the duplicate rung hid. The transcription is the one thing that can go
  stale, so a template that stops offering the example it copied turns the check
  red rather than leaving it mounting something nobody is offered.
  
  The unit tests prove every direction: the shipped example mounts, the check
  leaves the environment as it found it, and a template whose budget window
  nothing meters, whose ladder names a harness nothing contributes, or which
  renames the example out from under the transcription, turns the check red.
  
  The relay's gate carries the proof: `relay.a_rung_named_twice_mounts_once`
  mounts the template's own ladder shape against the built plugins, and
  `relay.the_first_mention_sets_the_order` walks a step onto the rung its
  step's ladder names first.

### Patch Changes

- e938103: Add the plan-board consistency check to the gate so delivered plans can move
  into durable design notes without losing their required assertions.
- Updated dependencies [e603b3b]
  - @amykit/model-specs@0.3.0
  - @amykit/core@0.3.0
  - @amykit/plugin-file-log@0.3.0
  - @amykit/plugin-file-notes@0.3.0
  - @amykit/plugin-file-queue@0.3.0
  - @amykit/plugin-file-store@0.3.0
  - @amykit/plugin-file-tasks@0.3.0

## 0.2.0

### Minor Changes

- d551e5b: amy is one install per machine, and it stays running.
  
  **State moved to `~/.amy`.** It used to live in `./.amy`, so `amy status`
  answered differently depending on where you were standing — and the wrong
  answer was "nothing tracked yet". amy drives work in checkouts all over the
  disk and is reached from whichever harness you are in, so it cannot be
  per-directory. `AMY_HOME` overrides. **State left in a working directory is
  reported by `amy doctor` and never adopted**, because picking it up silently
  would restore the behaviour being removed.
  
  **`amy start` and `amy stop` are the loop.** `start` runs it in the background
  with `--every <seconds>`, outliving the terminal that started it; `stop` ends
  it. `amy status` says whether it is up and since when.
  
  **`amy pause` and `amy resume` are the handbrake**, which is what `stop` and
  `start` used to be. Pausing ends work in flight and starts nothing new while
  the loop stays up. It survives a reboot because it is a file; the loop does
  not, because it is a process.
  
  **`amy workflow list` and `amy workflow rm`.** `rm` deletes a profile's
  records, its queue and its config entry, and prints what it would do unless
  given `--yes`. It never touches the log, which is append-only because the
  budget is measured off it.
  
  **`amy skills`** installs amy's skills into every harness it finds — Claude
  Code and Hermes today — rather than into one project. They ship inside
  `@amykit/cli` so they cannot drift from the amy that ships them. Three new ones:
  `/amy-init`, `/amy-show-me`, `/amy-status`, and `/amy-workflow` is now an
  interrogation that redraws the workflow after every answer.
  
  Changing amy's own codebase is not one of them: that is what `CONTRIBUTING.md`
  is for. A skill describing a repository the reader does not have is noise in
  the list an agent reads when deciding what to reach for.
  
  **`amy status --json`** for something else to render.
  
  Fixed: a hand-written plugin slice replaced the derived one instead of merging
  with it, so a config that set `retentionDays` on the queue lost the
  `directory` beside it — and two profiles quietly shared one queue, each
  claiming the other's work.
  
  `specTable()` now takes the state directory rather than a working directory,
  and `OVERRIDE_PATH` becomes `OVERRIDE_FILE`.
- f9944f6: A workflow is a name in a config, and a plugin is installed rather than
  compiled in.
  
  `--workflow` used to accept two literals, so an install could not drive a
  workflow this repository had not shipped — while the engine underneath it
  could drive anything. A profile is now an entry under `workflows:` in
  `.amy/config.yaml`: a name, the package that drives it, and optionally the
  plugins to mount under it. The two shipped ones are what a config with no
  such block gets.
  
  Each profile keeps its records and queue under `.amy/<name>/`, so a second
  workflow no longer writes over the first's state. **State from an older
  install stays where it was**: `amy doctor` names each directory it found and
  the one `mv` that moves it.
  
  The loader's table of literal imports is gone with the compiled binary. What
  installs is packages, resolved by name at run time, so a machine carries the
  plugins it uses and nothing else — `AMY_PACKAGES` takes the subset. A plugin
  named and not installed is refused at boot with the list of what is, and
  `amy plugin list` reports installed and mounted as the different questions
  they are.
  
  `@amykit/cli` therefore stops depending on ten plugins it never imported, and
  `amy init` prints the `npm install` line for whatever a configured workflow
  needs and this machine does not have.
- ec7c57e: Installing is `npm install -g @amykit/cli`, and `amy init` supplies the rest.
  
  Installing meant cloning the repository and running a shell script. That asks
  somebody to fetch a whole checkout to use a released product, and the script
  is POSIX, so Windows was not supported at all — for a tool whose entire job is
  to run unattended on whichever machine you leave it on.
  
  Now it is npm, which is the same three words on macOS, Linux and Windows, and
  npm's own shim puts `amy` on the PATH.
  
  The command still carries nothing but itself. A plugin resolves by name at run
  time, and a machine with no `codex` on it has no reason to hold the plugin
  that shells out to one — so what gets installed is what your config actually
  names, and `amy init` is what works that out:
  
  ```
  These are not installed yet:
    @amykit/plugin-linear
    @amykit/plugin-github
  
  Install them now? [Y/n]
  ```
  
  It asks rather than assuming, because installing into a global prefix is a
  change to the machine and not to amy. With nothing to ask on — a script, a
  pipe, CI — it prints the command instead of running it, and `--install` is how
  a pipeline says yes. `--no-install` keeps the old printing behaviour.
  
  What it offers is what the profile **will mount**, not what is recommended for
  it. That distinction is the bug this fixes as much as the ergonomics: a config
  naming `@acme/plugin-jira` is exactly the case worth installing, and a
  recommendation cannot know about a package this repository never shipped.
  
  Two failures it reports rather than leaves you to meet later: npm exiting
  non-zero, and npm exiting zero while the packages still do not resolve —
  usually a global prefix that is not the one amy is installed under, which
  would otherwise surface as a mount refusing by name on the first tick.
  
  `npm run install:local` stays, and is now what it always really was: how the
  gates prove an install works with no registry in the picture at all.
- 2b6bde3: `amy btw` — something said in passing becomes work.
  
  ```sh
  amy btw "bump the stale deps in the api package"
  ```
  
  The cheapest thing to lose is what somebody says while doing something else,
  and a ticket is the wrong shape for it: a ticket has an owner, a date and a
  conversation attached, and a sentence said in passing has none of those. amy
  had two ways in and neither fit — a ticket is work a tracker already knows
  about, a note is friction amy itself hit — so there was nowhere for *work
  somebody wants done that nobody will open a ticket for*.
  
  A third workflow, `@amykit/workflow-errand`, picks the task up, works in a branch
  of the repository it names, and either opens a pull request or comes back with
  an answer. **An errand that changed nothing is finished, not failed** — half
  of what people say in passing is "check whether X", which ends in a sentence.
  
  **Past a few in flight it holds and says so once.** Capturing costs nothing,
  and the failure that follows from that is thirty open pull requests nobody
  asked to review.
  
  `@amykit/plugin-file-tasks` keeps the tasks as a directory of markdown files, so
  an editor or a hook can add one too. `/amy-btw` is the skill: its job is
  turning what was said into a task that survives losing the conversation.
  
  It cost the core one action name — `run-errand`, the generic "ask the agent",
  which is now wanted by two workflows under names of their own. Nothing else
  changed: not the engine, not either other workflow.
- 1d89185: The version moves because a change said it should, and an installed package
  can say which one it is.
  
  Changesets owns the number, every `@amykit/*` package moves together through a
  `fixed` group, and the bump arrives as a pull request rather than as a commit
  somebody pushed. An installed package reads its identity out of a stamp
  written at pack time, and a tree with uncommitted changes gets no stamp at
  all — so `amy --version` says `dev` rather than naming a release that only
  existed on one laptop.

### Patch Changes

- b896045: Documentation that cannot go out of date, and a manifest a site can be built
  from.
  
  There was one 861-line README and twenty package READMEs, and nothing checked
  any of them against the code. A README is the cheapest thing in a repository to
  leave behind: nothing fails when it stops being true, and the day it matters is
  the day somebody is trying to write a plugin against a setting that no longer
  exists.
  
  `docs/` is now the documentation, in thirty-eight pages under eight groups, and
  **half of it is read out of the code on every build**. The commands come from
  the commander chain, the action catalogue and the port contracts from the
  source, the event kinds from the contract the log is already validated against,
  the `config.yaml` keys from the interface that defines them, the gates and
  rules from the policy — including the YAML comments, which is where the reason a
  rule is disabled actually lives.
  
  The interesting one is the plugins. Nothing declares "this plugin mounts the
  `tracker` port" in a manifest somebody keeps in step: **each plugin is
  registered against a registry that only takes notes, and asked.** A plugin that
  reads a credential at mount is handed a placeholder for exactly the variables
  its own source names, for the length of one call, never over a value already in
  the environment. So the reference tables say what the code does rather than what
  somebody last remembered to write.
  
  `npm run docs:check` is in `npm run gate`, and it names the file:
  
  ```
  docs: the code moved and the documentation did not. These are out of date:
    docs/reference/plugins.md
    plugins/file-queue/README.md
  ```
  
  Same promise `L3.GATE_HAS_FRESH_EVIDENCE` already makes about a gate's evidence.
  A block a page names and nothing produces is an error, and so is a block nothing
  places — a fact the documentation has and does not show is the same failure as
  one that is out of date.
  
  Every `packages/*/README.md` and `plugins/*/README.md` is generated from the
  package itself and says so in a banner. The root README is not, deliberately: it
  is the front door, it is argued rather than listed, and it went from 861 lines
  to 278 by linking rather than repeating.
  
  `docs/manifest.json` is one file a website reads instead of the repository — the
  navigation, every page with its front matter and headings, the full reference
  data, the catalogue and the news. It carries no timestamp, because a generated
  file that changes every time it is generated cannot be checked for drift.
  
  `npm run docs:changelog` caches the releases GitHub holds, so the news page
  exists without the build ever needing a network. And `npm run docs:draft` — the
  one part that is not deterministic and is deliberately outside the gate — has no
  HTTP client of its own: it mounts amy's own harness plugins through `mount()`
  and asks through the `agent` port, so a draft climbs the same ladder, under the
  same ceiling, into the same log as everything else. A plugin model that only
  works for the engine it was written for does not work.
- b53de08: The config `amy init` writes is one this build can read, and it names every
  setting there is.
  
  Two failures, both shipped, both caught by the same check.
  
  The loud one: the template carried `agent:` twice. YAML refuses a duplicate key
  rather than merging it, so `amy init` wrote a file `loadConfig` threw on and
  the next command anybody ran died. No test had ever parsed the template — only
  the roster beside it.
  
  The quiet one: `pollBackoffMs` was configurable for its whole life and appeared
  nowhere, so the only way to find it was to read the source. `staleClaimMs`,
  `maxItemAttempts`, `maxDraftAttempts` and the whole `errands` block were the
  same. A setting nobody can discover is a setting that does not exist, and the
  cost lands on whoever concludes the machine cannot do what it does.
  
  `checkConfigTemplate` now parses the template, refuses a key nothing reads, and
  refuses a setting the template never names. Named is enough — a setting
  commented out with the reason is documented. It runs in the gate and in CI, and
  `L2.DERIVED_ARTIFACTS_MATCH_THEIR_SOURCE` points at it: the template is derived
  from the settings the loader merges over, by hand, which is why it drifted
  twice without anybody noticing.
- eeba3e5: The release workflow stays dormant until `AMY_RELEASE` is set.
  
  The first release is deliberately later, and an unarmed release job failed on
  every push to main: GitHub refuses to let Actions open a pull request unless
  that is switched on, and there is no npm token behind it yet either. Both are
  real preconditions, and neither is a reason for main to be red in the
  meantime.
- 6c0a1ee: The release workflow calls the changesets action by the names it actually
  has. Its inputs were renamed in v2 and the old ones are a hard error, so the
  first run on main stopped before doing anything — which is the failure mode
  to want.
- ae1a7d8: The version bump regenerates the documentation, so the release can pass its
  own gate.
  
  A release moves two things the generated documentation is derived from: every
  package's version, which `docs/manifest.json` carries, and the pending
  changesets, which `changeset version` consumes into changelogs.
  
  So the "Version packages" pull request was the one pull request in this
  repository that could never be green — the drift check would report
  `docs/manifest.json` and `docs/changelog/index.md` as stale, correctly, and
  there was no way to fix it by hand that the next bump would not undo.
  
  `release:version` now ends in `npm run docs:generate`. Beyond the gate, it
  means the news page ships *with* the release rather than after it: by the time
  the version pull request is reviewed, "Coming next" is empty and the changelogs
  it describes exist.
  
  The released half still cannot write itself, because a GitHub release does not
  exist until the publish has happened. `npm run docs:changelog` after a release
  is what fills it, and until it runs the page says so rather than showing
  nothing.
- 13c950c: amy says what it is, rather than what its first workflow does.
  
  The description was "Drives a work ticket from in-progress to QA handoff" —
  which is one of the three workflows in the box, not the product. What amy is
  is the machine underneath: a state machine you leave running, where the core
  owns the actions and everything else — the workflow, the engine, the tracker,
  the forge, the agent, every notification channel — is a plugin you assemble
  for the work you actually do.
  
  And it runs *under* the harnesses rather than inside one. Claude Code, Codex,
  Hermes and a terminal are doors into the same install, which keeps its state
  when any of them closes.
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
  - @amykit/model-specs@0.2.0
  - @amykit/plugin-file-notes@0.2.0
  - @amykit/core@0.2.0
  - @amykit/plugin-file-log@0.2.0
  - @amykit/workflow-ticket-to-qa@0.2.0
  - @amykit/plugin-file-queue@0.2.0
  - @amykit/plugin-file-store@0.2.0
  - @amykit/plugin-file-tasks@0.2.0
  - @amykit/plugin-notify-hermes@0.2.0

# @amykit/core

## 0.8.0

### Minor Changes

- a41a17f: **A shipped workflow runs as a phase.** A project walking BRIEF → WORK → PROVE on amy's own pieces stopped three times in 0.7.1, and the whole-project example hid all three. It never ran ticket-to-qa (it set the WORK child to `DONE` by hand), and it ran actions without the boot check the daemon makes.
  
  - **The unit a called record is for is the core's.** A called record's id is `SHOP-1/WORK#1`. ticket-to-qa asked the tracker for that id as a ticket, and its review lane did the same. errand and note-to-plan looked for a task and a note under it. prove, feature-grooming and the worktree plugin each kept a private split on `/`. `unitOf(record)` from `@amykit/core` now says what the unit is at any depth, keeping a root's `@repository`, and every one of them uses it. `L0.A_CALLED_RECORD_NAMES_ITS_UNIT` refuses a split of an id on `/` or `#` outside the core.
  - **The testkit walks every world called as a phase too.** `conformance` and `conforms` now walk each world a second time as `UNIT/PHASE#1`, under a new property, "called as a phase, it does what it does standing alone". The two walks must make the same tracker, code-host and conversation calls, plan the same actions and come to rest in the same state. A world that keeps state gives `again()` to be rebuilt, and `said()` with `watched()` to say what its ports were asked. A checkout or an agent's context may still key on the record's own id.
  - **A claude run that may write can write.** A print-mode run with no `--permission-mode` and the user's settings dropped is refused every edit, so a writing step answered and changed nothing. The new `permissionMode` setting (default `acceptEdits`; `auto` or `bypassPermissions` also allowed) is now always passed, and a read-only run is still `plan`. An empty, unknown or non-writing mode is refused at mount, naming the setting. `harnessConformance` in agent-kit holds claude and codex to it.
  - **A core action's name means the core's action.** prove's gave-up notice was a handler named `escalate`, the core's tracker write, so the mount counted a write prove never makes, for a tracker it does not need. It is now `give-up`. prove's own actions also reached no catalogue, so called as a phase it was refused ("action `lease`: nothing defines it"). A workflow's `catalogue` now declares its own actions on ports it needs, and the composed workflow carries every callee's to the mount. A handler under a core action's name, in a workflow that does not need that action's port, is refused at boot.
  - **A called phase is counted as it is standing alone.** A workflow's catalogue entry is now the port its handler reaches, so prove's agent step, now its own `run-agent-step` catalogued on `agent`, is counted by the budget through every call (it ran while the budget refused agent work), while a deterministic or `wait-until` step stays a `run-step` the budget does not hold; prove still boots with no agent mounted. A called workflow's `store` (by the name it asks for, whatever its call binds it to) lists its own records under every root rather than its caller's roots, so errand's `maxInFlight` and note-to-plan's `maxOpenPlansPerRepo` count errands and plans called as phases.
  - **A unit has one conversation, and reading it opens none.** `Conversation` gains a required `known(workId)`, which answers the thread a work already has and creates nothing. Slack, Telegram and the terminal implement it, and a conversation adapter of your own must too. ticket-to-qa reads replies through it, so a look that only reads leaves no thread behind. A called phase's threads are the unit's, titled by the ticket, setup's included. The notifier posts into the unit's thread too, instead of opening one under the call's id.
- 9a9ac0a: **A skill is asked for in the chat.** Grooming needed a terminal: amy's skills
  lived only in a harness's own directory, and the chat knew three commands. Now
  `/amy-groom TBO-1` works from Slack or Telegram, and the thread goes on.
  
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
- 3a8cc7a: **Outside text reaches the agent as data.** A ticket title, body, label,
  comment, review thread and reply are written by somebody who is not the
  operator, and they used to reach a writing agent verbatim beside its
  instructions. Now every one of them travels in one closed envelope.
  
  - **`outsideText` names its source and cannot be closed from within.** The
    source is plain text in an attribute that strips anything able to end it;
    every envelope marker in the body — plain, full-width, split with zero-width
    characters, or spelled with look-alike letters — is replaced with a note, so
    exactly one envelope opens and one closes.
  - **Characters that hide or reorder text are removed, and the envelope says so
    once.** Bidi overrides, isolates and tag characters are stripped; text that
    carried none comes back byte for byte.
  - **Long text is cut with a count**, so a body past the limit says how many
    characters were left out instead of ending mid-sentence with no sign.
  - **A prompt says once, before the first envelope, that what is inside is
    data.** `withOutsideNotice` writes that line when, and only when, the prompt
    carries outside text. The operator's own words — the chat, an errand, a note
    and the brief — stay unfenced: they are instructions.

## 0.7.1

### Patch Changes

- e79dea1: **What the core marks a value with, every copy of the core can read.** An install always holds several copies of the core: the CLI's own, the plugins root's, and whatever a project's phase folder resolves from its own `node_modules`. 0.7.0 marked a workflow's port need and an operation's declared failure with local symbols, a different key in every copy. So no project whose phase asks for a port could mount ("Cannot destructure property 'optional' of 'need[PORT_NEED]'"), and a plugin's declared failure was answered as an internal error. Both are now registered symbols. `packages/core/tests/two-copies.test.ts` runs the core against a second copy of itself, the `project-phases` gate mounts a phase that imports its own core, and `L0.THE_CORE_MARKS_WITH_REGISTERED_SYMBOLS` refuses a local symbol in the core.

## 0.7.0

### Minor Changes

- b761f29: **A config is typed by its schema.** `definePlugin` gives a plugin's register and ready hooks the post-validation type derived from its schema, rejects mismatched defaults, and moves every shipped schema onto that declaration. Scalar and `string[]` settings no longer cast away the host's validation; record settings remain explicitly narrowed where a plugin needs a stronger value shape.
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
- 2b4deec: **A run carries only what amy hands it.** The three agent CLIs amy drives used to carry the operator's own setup into a ticket run and write back into it. Now each run is kept apart:
  
  - **Claude** runs with `--setting-sources project,local --strict-mcp-config --no-session-persistence`. The operator's `CLAUDE.md`, hooks, plugins, MCP servers and skills stay out, and no session or auto-memory is written under `~/.claude/projects`. The repository's own settings still load. A step whose skill ladder names a skill is lent that one skill through `--add-dir`, and nothing else of the operator's.
  - **Codex** runs with `--ignore-user-config --ephemeral --disable hooks --disable plugins --disable apps --disable memories`. The login still comes from `CODEX_HOME`, and `~/.codex/AGENTS.md` and user skills still load, since Codex has no switch for them.
  - **Hermes** runs in its own profile, `hermes -p amy`, set by the new `profile` setting. `amy init` and `amy add` create that profile from the active one when it is missing, with memory, unasked skill writes and the curator turned off. `amy doctor` goes red, naming the fix, when the profile is missing or has any of those turned back on.
  
  **A plugin can prepare something outside amy's state.** `Plugin.setup` is run by `amy init` and `amy add` after a plugin's files. A setup gets the plugin's settings and a command runner, answers the way a check does, and one that throws is reported without stopping the next. `AskContext.skill` carries the skill a relay addressed the prompt to, with the directory it is installed in.
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
- bb67d1f: An operation is declared once, and every door will run it the same way.
  
  `defineOperation` in `@amykit/core` declares one operation: its id and domain,
  its summary and description, its input and output (or the named events it
  streams), the errors it can return, its examples, whether it is local-only,
  what it writes, and how HTTP and the command line reach it. Input, output and
  events are any schema implementing Standard Schema and Standard JSON Schema —
  Zod 4.2+, ArkType, Valibot — whose interfaces the core copies, so the core
  still installs no dependency. `invoke(contract, id, input, context)` is the one
  road every door takes: it validates the input before the handler and the
  output after it, answers a declared error as itself, and answers a throw, an
  undeclared code or an output the schema refuses as `amy.internal`, naming the
  operation. `contractDocument` writes the contract as OpenAPI 3.1.
  
  `@amykit/services` is the new home of amy's own domains. It ships none yet:
  `npm run build` writes its empty `openapi.json`, and five rules hold every
  domain to come — a domain keeps its layout and reads no other, only a
  repository reaches a port, no database or filesystem bypasses the ports, every
  operation and property is documented, every declared error is produced by a
  test, and the document only breaks when `API_MAJOR` is raised (checked with
  oasdiff, which `./scripts/setup-dev.sh` now installs).
  
  Before, amy's rules lived inside 2844 lines of command-line handlers, so a
  server or an SDK would have had to call into the CLI or copy it.
- b266baf: Questions can carry closed answers through the conversation adapters, and ticket-to-qa records a selected answer beside its question.
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
- 37504c1: **The event log can be watched, from any process.**
  
  Everything amy does is a line in the event log, and a reader in another
  process — `amy status`, a dashboard, the window planned next — could only read
  it again and guess how often. The log is the one place that knows something
  changed, so it is now the place to ask.
  
  - `EventLog` gains an optional `watch(since, onEvent)`: every event at or
    after `since`, oldest first, then every event any process appends, until the
    returned function is called. Optional because a log may be a sink nobody
    can watch.
  - `watchEvents(log, since, onEvent, { everyMs, onPolling })` in the core
    watches any log: through its own `watch`, or by polling `read` when it has
    none, calling `onPolling` once so the caller can say so.
  - `@amykit/plugin-file-log` implements `watch` by following each day file from
    a byte offset. A line is delivered only once its newline is on disk, so a
    line the daemon is halfway through writing is never read half, and a new
    day's file is followed without resubscribing.
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
- 0815efb: **Waiting is not trying.**
  
  The core now records `looks` separately from `attempts`: waits and logistical
  acts are visible without consuming an attempt ceiling. `looksIn` and
  `attemptsIn` make the distinction explicit, an `act` may be marked
  `{ attempt: false }`, and an action result can return `notATry` to refund a
  pre-charged attempt and delay the next look.

### Patch Changes

- 3b540fa: A frozen adapter, such as `Object.freeze({ name, register })`, mounts again
  through the host that only takes declarations. The proxy that keeps a
  plugin's own receiver stood on the plugin itself. Replacing `register` on a
  frozen object breaks a Proxy invariant, so it threw a `TypeError` before
  registration ran. It now stands on an empty object of its own and still reads
  and calls every member on the plugin.
- 91f6caf: `declaredWorkflowsOnly` keeps every member of the plugin and of the registry
  on its own object. It used to wrap both in a prototype copy, so a class
  plugin whose getter or method reads a `#private` field threw a `TypeError` on
  its own name, and boot stopped before mount could report it.
- ec32d67: Treat structured provider usage limits as waits rather than attempts.
- 09cb74f: The docs describe the contract that exists. Every README is rewritten against the code: a plugin's README lists the ports, actions, operations, commands, events and environment its package registers, and opens with `amy.about`, a new field in its package.json saying when to use it.
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

## 0.6.0

### Minor Changes

- 9e3cb22: What a private workflow had to write for itself, the shipped one now does.
  
  - A commit status GitHub returns in lower case reads as passing or failing; every one used to read as running.
  - `Git` commits without pushing, and `push` refuses anything that is not a fast-forward, naming the branch. `commitAndPush` is built on the two.
  - A review thread carries the file it is on.
  - The code host finds a pull request by the id in its title, open or merged, and the author's pull requests somebody asked to change. A workflow that claims no writes is handed `pullRequestAncestry` and both of these.
  - `ticket-to-qa` takes `policy.writes: operator`: every tracker and code-host write is said once, in the work's thread or through the notifier, and the machine waits until it sees it made. The workflow then claims no writes at all.
  - A ticket Linear labels into several repositories (`repoByLabel`) is one work item per repository, `TICKET@owner%2Fname`, and QA receives it once, when every one has merged.
  - `file-queue` takes `order: priority`: the most urgent due item first, first in first out within one priority, refreshed on every discovery from the tracker's own urgency.

## 0.5.0

### Minor Changes

- c1edd17: Add a Slack adapter for the conversation port: one thread per piece of work over the Web API, operator-only replies with downloaded files, `Retry-After` backoff, and `amy doctor` checks for the token, channel and scopes.
- 5ff03ad: A grooming snapshot is now a commit that can be searched. `GitBaseSource.snapshot` never fetched, so on a machine where nobody had started a ticket in a repository for two weeks it answered "this column does not exist" about a column that shipped twelve days ago; it read `origin/<base>` again on every call, so two reads in one run could come from two commits; and it returned no revision, so no claim made from it could be checked later. It now fetches `+refs/heads/<base>:refs/remotes/origin/<base>` first (naming the destination, so a checkout with a narrowed `remote.origin.fetch` still moves) and refuses the snapshot if that fails rather than serving the old ref, then pins the commit it resolved, and every answer is read at that commit.
  
  This is breaking for anything that implements `BaseSourceSnapshot` itself: it must now provide `revision` (the full commit id), `committedAt` (ISO 8601), `search(text, { paths, regex, limit })`, which returns `{ matches: { path, line, text }[], truncated }`, and `history(text, { paths, limit })`, which returns `{ entries: { commit, at, subject, change: "added" | "removed" }[], truncated }`, newest first. A consumer that only reads snapshots is unaffected.
  
  `read` now returns a file exactly as it is, including the trailing newline it used to drop. `RunOptions` gains an optional `trim`: `NodeCommandRunner` still trims stdout unless it is `false`, which is what the snapshot asks for so that a file, a matched line and a count of whitespace keep the whitespace they are made of.
- 3a993e1: Let workflows resolve the base of a stacked pull request through the code-host port.
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
- 8b2fcc8: Let a workflow ask and hear an operator in a work-scoped conversation instead of the tracker.
- 9bb3d24: Park an opted-in workflow before it spends another agent run with no new evidence.
- 98cc10e: **Breaking for workflow authors — one migration for two changes.**
  
  An action is declared once. `WorkflowRuntime.handlers()` and `Workflow.usesActions` are replaced by `WorkflowRuntime.actions`: a map whose keys are the actions the plan may emit and whose values run them — a handler, or `{ port, method }` for a method its port marked with the new `acceptsAction`, which the host calls with the action and its context and whose answer lands in `outcomes` under the action's name. The mount refuses at boot, by name, a key with nothing behind it, a port nothing mounted, a method the port lacks, or one that takes its own arguments rather than an action; the engine refuses a plan carrying an undeclared action before any of its actions run. A package still carrying `usesActions` or `handlers()` is refused with the sentence that says what to change.
  
  `apply` is told the move: `apply(record, plan, outcomes, observation, now, moved)`, where `moved` is `{ from, to }` for an advance and `null` otherwise. `record` has already moved, so where the work came from is `moved.from`, never `record.state`. `movedBy`, `runAction`, `implementationOf`, `undeclaredIn`, `unrunnable`, `mountedActions` and `mountedRuntime` are exported from the core.
  
  `ticket-to-qa` now resumes an answered escalation in the state that raised it — implementing, the gate, an automated or human fix, or reviewer assignment — instead of always in `HUMAN_FIX`, and starts its attempt counters again when it does. `@amykit/workflow-testkit` takes a `ports` option for actions declared as a port and a method, and `amy workflow new` scaffolds the new shape.

### Patch Changes

- d490ceb: Preparing a branch no longer erases a commit the machine made and could not push. `Git.prepareBranch` used `checkout -B`, which reset an existing local branch onto the remote branch or the base, so a commit whose push had failed was gone at the next look with nothing to say it existed. A branch that does not exist locally is still created from the remote branch, or from the base when the remote has none. When the remote is ahead of the branch, it is fast-forwarded. When the branch holds commits the remote lacks, it is kept as it is. One that diverged from its remote is refused, and the error names the commits only the local side holds. `Git.commitAndPush` now also pushes such a commit when the tree is clean, and returns true when it does.
- b8c781a: Let a project keep three phases — `brief/`, `workflow/`, `test/` — that share briefs while keeping state and spending isolated. Every such folder is a phase, a lone `workflow/` included, so its state moves under the project key and nothing is kept from an old profile of the same name. Each phase keeps its own tasks and Slack threads, `amy brief` names the missing `brief/` when a project has none, and `amy stop` signals only the selected phase's daemon without touching the shared handbrake.

## 0.4.0

### Minor Changes

- c30789e: Add provider-neutral feature grooming with read-only base-branch snapshots and reconciliation provenance.
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
- 0ca2c1c: A reply inside a review thread reaches the agent.
  
  `ReviewThread` carried the first comment of a thread and nothing that
  followed it, so a reviewer's correction written inside the thread sat one
  field away from every consumer: `address-threads` handed the agent what the
  thread *started* with, and "whose turn is it" was a question the view could
  not answer. The port grows `comments` — the conversation, oldest first,
  opening comment included — and `author`/`body` stay the opening comment's,
  so a consumer that never asked for the conversation is unaffected and
  `comments.at(-1)?.author` answers whose turn a thread is from the view
  alone. The GitHub query asks for `comments(first: 50)` with `createdAt` in
  the same request, and the adapter maps the list. The `address-threads`
  prompt renders the conversation attributed — a later comment is introduced
  as a reply, not restated as the objection — and says that a later comment
  answers the earlier ones, so an agent handed a correction inside the thread
  is handed the correction.
- fc6748a: The forge is asked, not run beside.
  
  Every gap in a port became an adapter in whoever hit it: a workflow that
  needed what the plugins know was shelling out to `gh` beside the plugin that
  already owned it and opening its own GraphQL connection to Linear beside the
  tracker that already had one, and the second workflow to hit the same gap
  wrote it all again. The port grows what the adapters were compensating for.
  
  `CodeHost` grows `pullRequest(repo, number)` — readable merged or not, the
  open-only filter staying where it belongs, in the by-branch search — and
  `PullRequestView` grows `merged` and `base`, mapped from the same node in
  the same query, with both reads running one shared fragment so they cannot
  drift apart. It grows `merge(repo, number, method)`, the method the base's
  ruleset allows being the caller's to name; `submitReview(repo, number,
  review)`, the state as forge vocabulary and the decision to submit as
  workflow policy; `createIssue(repo, { title, body })`; `commitStatuses(repo,
  sha)`, so a freeze is a workflow's reading of a status list rather than a
  private `gh api` of its own; and `changesRequestedOf(login, repos)`, the
  mirror of `reviewsRequestedOf` — "where did my review leave changes
  requested" — kept honest by the adapter reading each candidate by number,
  because the search cannot narrow on who left the changes requested.
  
  The tracker carries what a ticket is: `ISSUE_FIELDS` grows
  `labels { nodes { name } }` and `Ticket` grows `labels: string[]` — a label
  is how a team says what a ticket *is*, and with the description and the
  comments already shipped, the Linear reader a workflow carried has nothing
  left in it. What stays in the workflow is policy: which review state to
  submit, whose thread to close, what counts as a freeze.
- 5b37451: The ports belong to the core.
  
  `Tracker`, `Agent`, `Gate`, `Ticket` and the outcome contracts they carry
  moved from `@amykit/workflow-ticket-to-qa` to `@amykit/core`, beside
  `CodeHost` and `Harness`, so a workflow nobody shipped declares every port
  it needs by importing `@amykit/core` and no plugin in the install depends
  on a workflow package to know what a tracker is. The workflow re-exports
  every name for one minor version so nothing breaks on the way past, and
  the tracker contract grows a declared write surface: reads
  (`TrackerReads`) and writes (`TrackerWrites`) are separate interfaces a
  mount can hand out separately, with `TRACKER_WRITE_CAPABILITIES` naming
  what each core action resolves to.
- bfda1ac: The threads close when they are answered.
  
  `CodeHost` carried no way to settle a review conversation, so a workflow
  state whose exit reads "no open thread" could not reach its own exit: the
  code was fixed, the forge kept the thread open, and a ticket that had done
  nothing wrong escalated at the ceiling. The port grows
  `resolveReviewThread` and `unresolveReviewThread` — one id, one call — the
  GitHub adapter runs the `resolveReviewThread`/`unresolveReviewThread`
  GraphQL mutations through the scripted runner, and the action catalogue
  grows `resolve-review-thread`, dispatched to the code-host port, so a mount
  that cannot run it is refused at boot by name.
  
  The ticket-to-qa machine presses the button where the gap was: inside
  `COPILOT_FIX`, threads the record judged `fixed` and the forge still holds
  open get one act of `resolve-review-thread` each, and the next look finds
  them resolved and leaves through the exit condition instead of through the
  attempts. Who may close what stays the workflow's policy — only the
  automated reviewer's threads, only the ones the machine itself answered,
  and never a colleague's; `HUMAN_FIX` does not emit the effect at all.

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

## 0.2.0

### Minor Changes

- b53de08: A poke collapses the wait, so anything that hears an event can push.
  
  The queue was already the schedule: a step that takes half an hour is one look
  that takes half an hour, and the look after it is queued the moment it
  finishes. Nothing polls while work is happening. What did wait on a clock was
  the other half — a state holding for somebody else to move, looking again
  every five minutes.
  
  ```sh
  amy poke PROJ-1239
  ```
  
  The look that already exists moves to now. Not a second look beside it, which
  is the whole design of `Queue.promote`: two items for one piece of work would
  each chain their own successor, and the queue would fork into two chains that
  both spend an agent.
  
  Three answers, and each is a different reason to do nothing more. Work being
  worked on is left alone — the running step queues its own successor. Work held
  back moves. Work nothing knows about is queued, which is what turns any webhook
  into a push without this growing an endpoint: whatever already hears the event
  runs the command.
  
  Poking work that has settled costs one look and no agent. The decision function
  answers `settled` and the engine completes it without chaining anything, so
  nothing has to load a record to find out first.
- eb5214d: A pull request carries its size, and a review too large for an agent is
  handed back before one is called.
  
  `PullRequestView` gained `changedFiles`, `additions` and `deletions`. The
  forge already knew all three and was throwing them away, and fetching the diff
  to work them out later costs the exact thing the number exists to avoid.
  
  `@amykit/workflow-ticket-to-qa` uses them for two new ceilings,
  `maxPullRequestFiles` (60) and `maxPullRequestLines` (2000). Past either, a
  review is escalated to the ticket owner instead of handed to an agent —
  naming which ceiling was passed and by how much, because "I am not doing this
  one" without a number is a refusal nobody can act on. Zero on either switches
  it off.
  
  The point is *when* it refuses. The decision is a pure predicate over a
  number the observation already carried, so it costs nothing at the one moment
  where making the call would have cost the most. A five-hundred-file review is
  where an agent is least likely to help and most likely to be expensive about
  it, and three attempts before giving up is the worst of both.
  
  It reuses `ESCALATED` rather than adding a state: that state already means
  "this needs the person whose ticket it is", which is exactly what a change
  nobody should automate needs. It escalates once and then holds, rather than
  filing the same thing on every look.
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
- 76692e1: Friction becomes a plan, and the queue stops needing a ticket.
  
  Two contracts move into the core, because neither of them ever named a domain.
  `CodeHost` and the pull request view it returns — a repository, a branch, a
  login — leave `@amykit/workflow-ticket-to-qa`, so one mounted `@amykit/plugin-github`
  now serves any workflow. `Harness` joins them: a prompt, a directory, and an
  account of what the answer cost. The harness plugins contribute the bare CLI
  alongside their ticket-shaped agent, and `@amykit/plugin-agent-relay` mounts both
  halves behind the one `agent` port, so a second workflow's own prompts climb
  the same ladder, under the same ceiling, in the same log.
  
  `@amykit/workflow-note-to-plan` is that second workflow, and it is the proof the
  plugin model was waiting for: it runs on `@amykit/plugin-serial-engine`
  unmodified. Going through the seam found one defect in it — every workflow
  runtime re-ran `applyPlan`, which the engine had already run, so every retry
  was counted twice and every move wrote a transition from a state to itself. A
  ceiling of three implement attempts was really one and a half. Fixed, and both
  end-to-end scenarios still pass unchanged.
  
  For anyone driving this from a config: `@amykit/plugin-file-queue` and
  `@amykit/plugin-file-store` gained a `directory` setting, so two workflows can
  share one `.amy` without reading each other's work. `Announcement` gained an
  optional `kind` — `failing`, `gave-up` or `recovered` — so a channel can tell
  a step that failed once from a machine that has stopped.
  
  For anyone typing at it: `amy note "..."` writes a piece of friction down and
  queues it, `.amy/notes/` is watched for the longer ones, and
  `amy --workflow note-to-plan tick` drives them to a pull request adding a plan
  to the repository the friction is about. Nothing in that path touches a
  tracker.
- 353d361: One adapter for every command line tool, instead of one plugin each.
  
  `@amykit/plugin-command` mounts a `commands` port and a `run-command` action. A
  workflow asks for a command *by name*; the config is the only place that says
  what that name runs:
  
  ```yaml
  plugins:
    "@amykit/plugin-command":
      allow:
        datadog: pup monitors list --json
        notion: ntn page get
  ```
  
  That split is the security model. A command line assembled from a ticket body,
  an agent's answer or a file somebody dropped in a directory would be a machine
  that runs whatever a stranger can type into an issue — and this one reads
  issues for a living. Arguments are passed as positional parameters
  (`sh -c 'pup "$@"' sh --since 1h`), so an argument carrying a semicolon is an
  argument.
  
  It was made general by evidence rather than guess: `@amykit/plugin-command-gate`
  and `@amykit/plugin-plan-check` were already the same shape twice.
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
- a97c34d: The engine drives a workflow it does not know.
  
  `WorkflowRuntime` is new in the core: what a workflow contributes so that
  something else can run it — how to find work, what the world looks like, one
  handler per action, and the fold only the workflow can do. The serial engine
  takes one and keeps the half that names nothing: the queue, the attempt
  counts, the budget and the handbrake.
  
  For anyone driving this from a config: `repos`, `qaStatusName` and `policy`
  moved from the engine's settings slice to the workflow's, and the engine
  gained `retryDelayMs` of its own. `amy` maps both for you; a hand-written
  `plugins:` slice needs the two keys moved.
- 0b5e3d8: The forge says whether it can merge, whether its checks passed, and what is
  waiting on you.
  
  Three things the forge always knew and nothing here could ask it. Each one is
  a `CodeHost` question, so any workflow gets them and none of them is the
  ticket workflow's private vocabulary.
  
  **`checks`** — what CI says about the head, and the commit it says it about.
  Carried with the sha for the same reason a review carries one: a green rollup
  from three pushes ago says nothing about what is there now. `none` is a
  separate answer from `failing`, because a repository that runs no checks
  reports exactly that, and a machine reading it as "not passing" would hold
  every pull request for a verdict nobody is coming to give. Seen in the wild on
  a release pull request whose workflows are all skipped.
  
  **`mergeState`** — `conflicting`, `behind`, `mergeable` or `unknown`. Only the
  states a workflow can act on itself, plus not-yet-known, because the forge
  works a merge out asynchronously and guessing either way is how a branch gets
  handed over as mergeable before anybody knows. Everything else a forge reports
  here is already carried by `reviewDecision` and `checks`, and a second name for
  it would be two fields free to disagree.
  
  **`reviewsRequestedOf(login, repos)`** — the open pull requests waiting on one
  person. `reviewLoad` counts; it does not say which, and the second cannot be
  derived from the first. Scoped to the repositories given, and an empty list is
  nothing to search rather than everything: a forge search runs across the
  account, so an unscoped one returns work from every repository the credential
  can see.
  
  **Nothing is offered to a reviewer that the forge already says is broken.**
  Red checks, a conflict, or a branch sitting on a base it has moved off now go
  back to the ticket's owner instead of onto somebody's pile. Review time is the
  one currency here nobody can top up — the reason the per-reviewer ceiling
  exists — and a reading of a branch about to change is a reading done twice.
  A verdict still running is waited for, bounded by the same ceiling the local
  gate answers to, because a check that is configured and never reports would
  otherwise be a ticket that stops with nobody told.
- 616f7e6: A pull request carries its URL, an errand opens its own as a draft, and the
  tests are type-checked.
  
  `PullRequestView` gains `url`, and `OpenPullRequestRequest` gains `draft`.
  The errand workflow opens as a draft — nobody asked for that work at the
  moment it landed, and work somebody is waiting on is not a draft — and
  announces the link rather than the number, because that announcement is read
  on a phone more often than anywhere else and a number is a thing you have to
  go and look up.
  
  Adding a required field is what turned up the rest: **nothing type-checked the
  test files.** `tsc --build` compiles `src` only, and vitest strips types
  without checking them, so a test could name a field that does not exist and
  stay green. `npm run typecheck` now covers them, in the gate and in CI.
  
  It found 45 errors on the first run. Most were harmless drift, three were not:
  
  - The ticket workflow's walkthrough — the most important test here — typed its
    effects parameter off `effectsOf`, **a name that does not exist**. TypeScript
    never saw it because the reference was in type position and esbuild strips
    those, so the whole `switch` over the workflow's effects was unchecked.
    Adding an effect would not have failed it.
  - `@amykit/plugin-agent-relay`'s doubles returned `{ kind: "clear" }` for a
    `TriageOutcome` that has been `{ clear, questions, at }` for a while, and a
    `NamedAgent` with no `using`, which is the method the skill ladder calls.
  - Six engine test builders typed their overrides as the engine's own deps
    rather than the ticket fixture's, so every option they accepted was one the
    type said could not be passed.

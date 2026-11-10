---
title: News
description: What shipped, and what is about to.
group: News
order: 1
---

# News

Every release, and everything written down and not released yet.

The released half comes from the releases on GitHub, cached into this repository
so that building the documentation never needs a network. The unreleased half
comes from the changesets in the working tree, which is the only one of the two
that exists before a release does.

```sh
npm run docs:changelog     # refresh the cache from GitHub
```

## Coming next

<!-- amy:generated changelog-unreleased -->

### **A brief is groomed from its sources.**

`minor` · `@amykit/cli`

amy ships an `amy-groom` skill: it reads the ticket and the code at a pinned
base commit, then asks one question at a time until every requirement in the
brief names its source — the ticket, a design actually opened, a decision
somebody made — and cuts the rest, with the reason. It learns the brief's
format and check from the workflow that judges it rather than carrying one,
writes a local file, and writes nothing to the tracker, the code host or chat.
Before, grooming a brief that a workflow holds tickets on had no skill in amy
at all, and requirements nobody asked for were the defect it exists to stop.

### **A brief is named the way its feature is.**

`patch` · `@amykit/plugin-linear`

A child ticket's `briefId` was its Linear parent's uuid, while the same parent
read as a feature (`getFeature`, `features`) was named by its identifier, and
the brief store keys a brief by that feature id. Every reader that asked the
store for `ticket.briefId` — ticket-to-qa's brief lane, a workflow looking for
a declaration file named `PROJ-1200.yaml` — found nothing, and read "no brief"
rather than failing: a ticket under a groomed feature was driven as if nobody
had groomed it. `briefId`, and `featureId` on updated groomed work, are now the
parent's identifier, and a test holds a child and its feature to one name.

### **A config is typed by its schema.** `definePlugin` gives a plugin's register and ready hooks the post-validation type derived from its schema, rejects mismatched defaults, and moves every shipped schema onto that declaration. Scalar and `string[]` settings no longer cast away the host's validation; record settings remain explicitly narrowed where a plugin needs a stronger value shape.

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-agent-relay`, `@amykit/plugin-claude`, `@amykit/plugin-codex`, `@amykit/plugin-command`, `@amykit/plugin-command-gate`, `@amykit/plugin-file-brief-store`, `@amykit/plugin-file-notes`, `@amykit/plugin-file-queue`, `@amykit/plugin-file-store`, `@amykit/plugin-file-tasks`, `@amykit/plugin-file-worktree`, `@amykit/plugin-github`, `@amykit/plugin-hermes-agent`, `@amykit/plugin-linear`, `@amykit/plugin-notify-hermes`, `@amykit/plugin-notify-inbox`, `@amykit/plugin-plan-check`, `@amykit/plugin-serial-engine`, `@amykit/plugin-slack`, `@amykit/workflow-errand`, `@amykit/workflow-feature-grooming`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-ticket-to-qa`



### A frozen adapter, such as `Object.freeze({ name, register })`, mounts again through the host that only takes declarations. The proxy that keeps a plugin's own receiver stood on the plugin itself. Replacing `register` on a frozen object breaks a Proxy invariant, so it threw a `TypeError` before registration ran. It now stands on an empty object of its own and still reads and calls every member on the plugin.

`patch` · `@amykit/core`



### **A lock is taken one way.**

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-prove`, `@amykit/plugin-slack`

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

### **A mount builds once.** `port`, `engine` and `contribute` accept `deferred(() => impl)`: the host builds it once every plugin has registered, once per mount and before any `ready`, building on demand when one reads another, so the order plugins are listed in does not matter. A build that throws is a boot refusal naming its plugin, and two builds that read each other are refused naming both. The agent relay, the serial engine and the three shipped workflows use it in place of their own `WeakMap<PluginContext, …>`, getter proxies and build-early `ready`. One behaviour change: the serial engine is now built at boot, so an engine with no workflow, no runtime or no queue, store or notifier is refused when the host mounts rather than on its first tick.

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-agent-relay`, `@amykit/plugin-serial-engine`, `@amykit/workflow-errand`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-ticket-to-qa`



### **A phase is proven, not asserted.**

`minor` · `@amykit/cli`, `@amykit/plugin-agent-browser`, `@amykit/plugin-agent-desktop`, `@amykit/plugin-prove`, `@amykit/plugin-terminal`, `@amykit/workflow-feature-grooming`

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

### A plan is a declaration. The plan a note becomes is asked for as a YAML declaration between `---` fences, its title and a few lines of why, because every plan in the repository is one now and `L4.PLAN_IS_A_LINKED_DECLARATION` refuses prose. Before, the prompt only said to follow the plans already there, which taught the old shape to a draft written against the new rule.

`patch` · `@amykit/workflow-note-to-plan`



### **A command belongs to the package that means it.** A plugin declares `commands`, `checks` and `files` beside `register`, read after the module is imported and before anything mounts: `amy --help` lists `amy roster` beside the workflow that brought it, `amy doctor` runs the checks it brought, and `amy init`/`amy add` write the files it brought into the profile's state, once. A command that declares `mount: true` receives the mounted ports or a refusal naming why the machine did not come up; every other command answers on the machine that will not boot, which is when it matters.

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-agent-relay`, `@amykit/plugin-file-notes`, `@amykit/plugin-file-tasks`, `@amykit/plugin-file-worktree`, `@amykit/workflow-errand`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-ticket-to-qa`

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

### **A plugin brings operations, not commands.** `PluginCommand` is removed: a plugin declares `operations` — each one `defineOperation`, with its input and output schemas — and the command line is drawn from them like every other door. Installing a plugin adds its command, its entry in `amy contract` and the id an action can call; removing it takes all three. A plugin that still declares `commands` is refused at load, naming the plugin and the member.

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-agent-relay`, `@amykit/plugin-file-worktree`, `@amykit/workflow-errand`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-ticket-to-qa`

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

### A plugin is installed into a workflow, as a package or as a fork of its source.

`minor` · `@amykit/cli`

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

### `declaredWorkflowsOnly` keeps every member of the plugin and of the registry on its own object. It used to wrap both in a prototype copy, so a class plugin whose getter or method reads a `#private` field threw a `TypeError` on its own name, and boot stopped before mount could report it.

`patch` · `@amykit/core`



### **A project is brief, work and proof.** The `brief/`, `workflow/` and `prove/` folders of a project compose the one workflow its config entry drives: each phase a `call()` to the `defineWorkflow` declaration its folder exports, walked as child records of one record, one profile and one daemon for the whole walk. The brief's own declared sections give the walk its vocabulary, what the brief workflow returned is what the proving workflow is handed as its input exactly, and an end named `refused` carries the row back to WORK, saying what did not hold. A phase neither present nor declared absent is refused at the walk's mount, naming it; a phase declared absent carries its reason on the workflow for `amy status` to show; a `test/` folder is told the phase is named `prove/`.

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/workflow-errand`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-ticket-to-qa`

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

### **A reply in a work's thread can be a question, not only an answer.**

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-claude`, `@amykit/plugin-codex`, `@amykit/plugin-hermes-agent`, `@amykit/plugin-slack`, `@amykit/workflow-ticket-to-qa`

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

### `amy update`, and the rollback it runs when a move fails, install into the plugins root with `--install-links`, the way `amy add` does. Before, they installed without it, so updating any other package could turn a workflow copied in from a path back into a link. A linked workflow's `@amykit/core` import resolves from outside the plugins root, and the workflow failed to load.

`patch` · `@amykit/cli`



### A row of next steps is a ticket. `@amykit/plugin-next-steps` mounts the `tracker` port over an execution-order table — `plans/next-steps.md` by default — read from the base branch, never from the standing checkout: a row is a work item, its linked plan the body, its place in the table the priority. A relative link is a plan in the table's repository, its id the slug; an `owner/name:plans/<slug>.md` link is one in another, its id `owner+name+<slug>`, so one table can order the work of several. Only the top `rows` (one by default) are work at once, a row gone from the table with its plan in `docs/design/` reads as `delivered`, and the branch is `branchPrefix` (`plan/` by default) and the plan's slug.

`minor` · `@amykit/plugin-next-steps`

It writes nothing: mount `ticket-to-qa` on it with `policy.writes: operator`
and `qaStatusName: delivered`, and a row reaches delivered when you merge the
pull request that moves its plan.

### **A run carries only what amy hands it.** The three agent CLIs amy drives used to carry the operator's own setup into a ticket run and write back into it. Now each run is kept apart:

`minor` · `@amykit/agent-kit`, `@amykit/cli`, `@amykit/core`, `@amykit/plugin-agent-relay`, `@amykit/plugin-claude`, `@amykit/plugin-codex`, `@amykit/plugin-hermes-agent`

- **Claude** runs with `--setting-sources project,local --strict-mcp-config --no-session-persistence`. The operator's `CLAUDE.md`, hooks, plugins, MCP servers and skills stay out, and no session or auto-memory is written under `~/.claude/projects`. The repository's own settings still load. A step whose skill ladder names a skill is lent that one skill through `--add-dir`, and nothing else of the operator's.
- **Codex** runs with `--ignore-user-config --ephemeral --disable hooks --disable plugins --disable apps --disable memories`. The login still comes from `CODEX_HOME`, and `~/.codex/AGENTS.md` and user skills still load, since Codex has no switch for them.
- **Hermes** runs in its own profile, `hermes -p amy`, set by the new `profile` setting. `amy init` and `amy add` create that profile from the active one when it is missing, with memory, unasked skill writes and the curator turned off. `amy doctor` goes red, naming the fix, when the profile is missing or has any of those turned back on.

**A plugin can prepare something outside amy's state.** `Plugin.setup` is run by `amy init` and `amy add` after a plugin's files. A setup gets the plugin's settings and a command runner, answers the way a check does, and one that throws is reported without stopping the next. `AskContext.skill` carries the skill a relay addressed the prompt to, with the directory it is installed in.

### **A view is data.**

`minor` · `@amykit/cli`, `@amykit/ui`

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

### **A workflow can call another, the way code calls a function.** A diagram marks a state `class X call`, and `calls` binds it to the workflow it calls: `call(review, { input, config, ports, output, effects })`, every member optional. The callee runs as a child record kept inside its caller's (`TBO-1/REVIEW#1`), with its own history and attempts, and only the deepest record in a call is observed. When the child ends, the caller takes the edge named for that end, folding what it returned. Before this, composing workflows meant importing another's states and record fields in TypeScript, and nothing showed or checked where one ended and the other began.

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-github`, `@amykit/workflow-errand`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-pull-request`

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

### **A workflow is a Mermaid diagram.** A workflow's shape is the `workflow.mmd` beside it — an ordinary `stateDiagram-v2` that GitHub and Obsidian render — and the host reads its states, start, waits and ends from it when the workflow mounts; `defineWorkflow`'s `states`, `waiting` and `terminal` are required only without one, and declaring both is refused at boot. `readDiagram`, `connects`, `markState`, `withDiagramBeside` and the `notWritten()` stub are in the core, Mermaid-checked against Pele in its tests. The engine logs a move the diagram does not draw as `workflow.undrawn_transition` and makes it anyway; the testkit fails one, and with `everyEdge` an arrow no world walks. `amy workflow new --from <file.mmd>` turns a diagram into a workflow that mounts with every decision a stub, `amy workflow check` lists the stubs and the arrows not walked, and `amy workflow export [--work <id>]` prints the diagram with a record's state marked. `StateMachine` takes an optional `diagram`. The three shipped workflows are each drawn as one and lose their state lists and their exported unmounted `errand`, `noteToPlan`, `ticketToQa` and `newRecord`; bind a plugin with `withDiagramBeside(plugin, entry)` instead. `ticket-to-qa` no longer asks a reviewer again on every look when nothing was pushed since they requested changes.

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-serial-engine`, `@amykit/ui`, `@amykit/ui-conformance`, `@amykit/workflow-errand`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-testkit`, `@amykit/workflow-ticket-to-qa`



### The `amy-workflow` skill teaches the three pieces a workflow is, Mermaid, Act and Decide: a `workflow.mmd`, a `decide` map with one pure decision per drawn state, and `actions` written against the `scope` they are handed. Before, it taught a `plan()` with a runtime beside it and a raw plugin registering states by hand. Neither of those mounts any more, so a person following the skill wrote a workflow amy refuses. The two opinions amy holds every workflow to, MAD and BEP (Brief, Execute, Prove), are written down in *MAD and BEP* under How it works.

`patch` · `@amykit/cli`



### **A workflow is one declaration.** `defineWorkflow` registers the pure machine and its deferred runtime together, resolves typed required and optional ports, validates and merges policy defaults, and constructs the core record fields. `planning` supplies the four typed plan constructors, and `amy workflow new` writes the new declaration.

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/workflow-errand`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-ticket-to-qa`



### Workflows can now declare one decision per diagram state, compose pure `before` and `after` filters around those decisions, and provide `discover`, `observe`, `actions`, and `remember` as individual runtime pieces. `extend` mounts supporting infrastructure from the same declaration. Legacy `plan`/`runtime` declarations and raw plugins remain supported, while mixing the legacy and new declaration members is refused at boot.

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/workflow-errand`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-ticket-to-qa`

The `agent` port an action receives now records every run as `agent.run`, and
an action's `announce(text)` turns a failed announcement into `notify.failed`,
so no workflow writes either by hand. `ports.notifier` stays strict.

`amy workflow new` now writes a runnable diagram-backed three-piece workflow.
The shipped errand, note-to-plan, and ticket-to-QA workflows use the new form.

### **A workflow is its diagram, its decisions and its actions, and nothing else mounts.** `defineWorkflow` takes only the three pieces: `decide`, one pure decision per state the `workflow.mmd` beside it draws, with `before`, `after`, `discover`, `observe`, `actions`, `remember` and `progress`. A declaration that still passes a single `plan()` or a `runtime()` factory is refused at boot, naming each and where it moved, and `states`, `waiting` and `terminal` are gone: a declaration still passing them is refused by name, and one whose host found no `workflow.mmd` beside its entry or at its package root is refused at mount, naming the workflow and the file. Before, both forms and both sources of states mounted side by side, so the boot check of one decision per drawn state applied to some workflows and not others, and the same fact could live in a list in code that nothing held to the drawing. The CLI now mounts only declarations: a plugin it loads from an install or from `~/.amy/workflows` that registers a workflow by hand with `registry.workflow(...)` is refused naming the plugin (`declaredWorkflowsOnly` in the core). Because every installed workflow now imports the core it is declared with, a package added by path is installed into amy's root as a copy with its dependencies (`--install-links`) and probed from there, rather than linked to a directory where its imports do not resolve. `amy workflow new` writes the three pieces each in its own file — `workflow.mmd`, `decide.ts`, `actions.ts` — joined by the one call in `index.ts`, with no runtime factory, and its suite mounts the workflow the way amy does. `defineWorkflow` also carries a plugin's `setup` and `environment`.

`minor` · `@amykit/cli`, `@amykit/core`



### **A workflow runs on lanes.** A diagram may draw `state X <<fork>>` and `state Y <<join>>`: every line out of the fork is a lane, every lane is a call, so a record of its own, and the caller moves to the join once every lane has ended, holding where each ended and what it returned, keyed by lane. There is no setting for how many: the number of lanes is the number of lines drawn. Before this, work that could run side by side ran one piece after the other, or was written by hand in a runtime the diagram never showed.

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-concurrent-engine`, `@amykit/plugin-serial-engine`, `@amykit/workflow-testkit`, `@amykit/workflow-ticket-to-qa`

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

### **A workspace is a capability.** Nothing is handed a workspace without asking: plugins borrow their checkouts through a `workspace` port the file-worktree plugin mounts, and workflows inherit them from their support, so a machine that works nowhere in particular needs none. The seven machine keys — `repos`, `workspaceRoot`, `checkouts`, `defaultBranch`, `baseBranch`, `gate` and `worktrees` — are read from the plugins whose slices carry them (`plugins: "@amykit/plugin-file-worktree"` for the six workspace keys, `plugins: "@amykit/plugin-command-gate"` for the gate). The doctor asks about checkouts, worktrees, `gh` and `git` only where a workspace was mounted, so a machine that drives no code — a support inbox, say — is told it is ready, and `amy update` moves an old install's keys under those slices, saying each move, keeping the original beside the config, and refusing a key put back at the top level by name. The provenance of every derived slice, now a property with its own falsifier (`machine_key_leaks_into_a_slice`).

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-command-gate`, `@amykit/plugin-file-worktree`, `@amykit/plugin-github`, `@amykit/plugin-next-steps`, `@amykit/plugin-plan-check`



### **The actions use the ports.** The errand, note-to-plan and ticket-to-qa write `discover`, `observe`, `remember` and every action as a function of the scope `defineWorkflow` hands it: `scope.ports`, `scope.config`, `scope.policy`, `scope.checkouts`, `scope.ctx` and `scope.announce`. `errandRuntime`, `planRuntime` and `ticketRuntime` are gone, with their `…RuntimeDeps` and `…RuntimeConfig` types; a test that built one mounts the declaration instead.

`minor` · `@amykit/workflow-errand`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-ticket-to-qa`

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

### **amy answers in the chat.**

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-slack`, `@amykit/plugin-telegram`

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

### An operation is declared once, and every door will run it the same way.

`minor` · `@amykit/core`, `@amykit/services`

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

### `amy update` reaches the release. It said `nothing to move` with 0.6.0 published to a machine on 0.5.0, for two reasons ([#110](https://github.com/nicolasmelo1/amy/issues/110)):

`patch` · `@amykit/cli`

- **A 0.x caret never crossed a minor.** Every `@amykit/*` package now moves to one release, asked once of the CLI's registry intent (`latest` unless the operator wrote another), whatever caret npm saved, and each manifest entry then names it as `^<release>`. Third-party packages still move only within the range the operator wrote, so a 0.x workflow at `^0.1.0` stays on 0.1.0. To hold the machine below a release, set `amyUpdateRanges["@amykit/cli"]` in `~/.amy/plugins/package.json`; `--check` names that pin and the release it holds you below, where it used to say `nothing to move`.
- **A CLI installed with `npm install -g` read as a checkout.** The global prefix is now an install root, on Unix and on Windows. The CLI moves there with `npm install --global`, and when a plugin in the release refuses to import, every move rolls back, the CLI included.

The `amy-update` gate stubbed out both of these with a stand-in npm that answered whatever it held. It now runs real npm against a registry on a loopback port, with the CLI installed globally.

### 

`` · 



### Treat structured provider usage limits as waits rather than attempts.

`patch` · `@amykit/core`, `@amykit/plugin-codex`, `@amykit/plugin-hermes-agent`, `@amykit/workflow-ticket-to-qa`



### Questions can carry closed answers through the conversation adapters, and ticket-to-qa records a selected answer beside its question.

`minor` · `@amykit/core`, `@amykit/plugin-slack`, `@amykit/plugin-telegram`, `@amykit/workflow-ticket-to-qa`



### **Grooming reads the sections its workflow declares.**

`minor` · `@amykit/cli`, `@amykit/core`

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

### Harness subscriptions report their account-usage windows through `amy status` and `amy budget`.

`minor` · `@amykit/agent-kit`, `@amykit/cli`, `@amykit/plugin-claude`, `@amykit/plugin-codex`, `@amykit/plugin-hermes-agent`



### The mutation fixtures `amy workflow new` writes beside a workflow are TypeScript now, the same as the scaffold they guard. Two of the three were still `index.js`, so a workflow written in TypeScript proved its guardrails against a file in a language it does not use. The rules read both, so `sf verify` in an existing workflow is unaffected.

`patch` · `@amykit/cli`



### Plugin versions and unused workflow observer declarations were removed; package manifests supply displayed versions.

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-agent-relay`, `@amykit/plugin-claude`, `@amykit/plugin-codex`, `@amykit/plugin-command`, `@amykit/plugin-command-gate`, `@amykit/plugin-file-brief-store`, `@amykit/plugin-file-notes`, `@amykit/plugin-file-queue`, `@amykit/plugin-file-store`, `@amykit/plugin-file-tasks`, `@amykit/plugin-file-worktree`, `@amykit/plugin-github`, `@amykit/plugin-hermes-agent`, `@amykit/plugin-linear`, `@amykit/plugin-notify-fanout`, `@amykit/plugin-notify-hermes`, `@amykit/plugin-notify-inbox`, `@amykit/plugin-plan-check`, `@amykit/plugin-serial-engine`, `@amykit/plugin-slack`, `@amykit/workflow-errand`, `@amykit/workflow-feature-grooming`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-ticket-to-qa`



### **A Telegram topic is a work item's thread.** `@amykit/plugin-telegram` is the `conversation` port over the Bot API: each piece of work gets its own topic in the operator's private chat with a bot (topics in private chats, Bot API 9.4), opened once and found again after a restart. Only the operator's replies in that topic are answers; anybody else's, and anything outside every topic, are ignored. Replies are filed on disk before Telegram's update offset moves, so no restart and no second process loses one. A file in a reply arrives as a local path, and one past the Bot API's 20 MB is named instead. The token is `TELEGRAM_BOT_TOKEN` in amy's environment and is written nowhere. `amy doctor` refuses, by name, a bot with topic mode off, an operator who never started a chat with it, and a token whose updates something else reads (409 Conflict).

`minor` · `@amykit/plugin-telegram`

```yaml
extraPlugins:
  - "@amykit/plugin-telegram"
plugins:
  "@amykit/plugin-telegram":
    operator: "123456789"   # your Telegram user id
```

**Telegram's and Slack's contracts are vendored and kept fresh.** Telegram publishes its Bot API only as a reference page, so `npm run contracts:update` derives that page into its types and methods, and `check:contracts` fails when today's page derives to something else. Slack's served OpenAPI description joins GitHub's and Linear's. The test fixtures export `assertValidBotApiCall`, `assertValidBotApiResult`, `assertValidSlackCall` and `assertValidSlackAnswer`, and both plugins' stand-ins are held to them.

### **The chat recovers, pays and reads fairly.**

`patch` · `@amykit/cli`, `@amykit/plugin-slack`

When the workflow does not mount, the chat's recovery grows one group of
plugins a mount at a time instead of trying every subset, and keeps a
thread-only adapter out of the way of one that can answer in the chat. Under
`chat.budget` with a dollar ceiling, `/harness` no longer offers a harness
whose turns nothing can price. A config lock left by a dead writer is cleared
under a guard named after the owner that was seen dead, so a writer acting on
an old look never removes a replacement. In Slack, work-thread reads no
longer hold the chat's follow-ups unread: the chat reads by its second minute
at the latest.

### **The config is written by what is mounted.** Every workflow's own vocabulary — the attempt ceilings its decisions read, the status a ticket moves to, where plans go and what judges them — moved out of the config's top level and into the profile that drives the workflow, checked at mount against the workflow's own `configSchema`. `amy init` writes a config that carries only the machine, and a commented example that teaches the shape; `amy add <workflow>` writes the profile block from what the workflow's schema asks for, with the settings that need an answer written as placeholders and the rest taken from defaults. `amy config explain` lists every setting the machine and each mounted thing carries, with its type, its default and the reason it is there; `amy config explain <plugin>` narrows to one.

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-linear`, `@amykit/plugin-serial-engine`, `@amykit/workflow-errand`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-pull-request`, `@amykit/workflow-ticket-to-qa`

A key of the old shape left at the top level is refused at boot by name, with
the place it moved to in the message, so nothing is silently read from where
it lived. `amy update` moves a v1 config for you: each old key is rewritten
under the profile or the plugin that reads it, the original file is kept
beside the config as `config.yaml.moved`, and a second update changes
nothing. The engine learns to tune itself at the same time — the serial
engine's retry between failed items is its own setting now, no longer
borrowed from whichever workflow's poll happened to be at the top of the
config.

### **An errand that answered a question is not delivered as an empty pull request.**

`minor` · `@amykit/core`, `@amykit/workflow-errand`

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

### **The event log can be watched, from any process.**

`minor` · `@amykit/core`, `@amykit/plugin-file-log`

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

### **The examples are not the machine.**

`patch` · `@amykit/cli`, `@amykit/workflow-errand`, `@amykit/workflow-feature-grooming`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-pull-request`, `@amykit/workflow-ticket-to-qa`

The five workflows amy ships moved from `packages/` to `examples/`, under the
same names and versions, so an install that names one updates without
noticing. `packages/` now holds amy itself and what it needs to run. Each
example opens its README with what it is for, written for somebody who has
never seen amy, above the reference generated from the package. A fork of a
version released after the move is read from `examples/`, and a fork taken
before it follows the release to its new directory on `amy update` instead of
stopping the update.

### **The frame is closed.**

`minor` · `@amykit/ui`, `@amykit/ui-conformance`

amy's window is about to be drawn by more than one renderer, and two renderers
drift apart without either being wrong. Before the first one exists, the
window is a locked file and every renderer is measured against it.

- `packages/ui/frame.yaml` is the closed wireframe as data: five regions and
  where each sits relative to the others, what each holds, the sections, the
  actions, a Neovim-style default keymap, the mouse, the surfaces a renderer
  may declare, the slots plugins add to, the narrowest window and the one
  rule by which a label may be abbreviated. It ships with `@amykit/ui`, which
  still depends on nothing, and is hash-locked.
- `@amykit/ui/frame` checks what it parses to (`checkFrame`), and reads keys in Neovim's
  notation: `buildKeymap` lays a person's `ui.keys` over the frame's and
  refuses, by name, a remap to an action the frame does not declare or two
  bindings a keypress cannot tell apart; `KeyReader` reads sequences, counts
  and the leader the way Neovim does. The renderer contract lives here too.
- New package `@amykit/ui-conformance`, and its `amy-ui-conformance` command,
  drive every
  renderer through a fixed script over a fixed world — by default keys, by a
  remapped keymap and by the mouse, and the default way twice — and read a
  projection out of what it laid out: regions, what each holds, and how each
  pair sits relative to each other, never a box. Eleven assertions hold it to
  the frame, to the other renderers and to the approved golden, naming the
  region, the relation or the first node that differs.
- Three local rules: `L0.A_RENDERER_ONLY_TRANSLATES`,
  `L0.A_RENDERER_NAMES_NO_COLOUR` and `L1.EVERY_RENDERER_HOLDS_THE_FRAME`.

### **The host lends the checkout.** `PluginContext` gains `checkouts()`, which answers with the `Git` and the layout for the calling plugin — the host's paths, the plugin's own `defaultBranch` and `baseBranch`, and the `worktree` port read whenever a path is asked for, so a worktree plugin listed after the caller is still the one used. The core exports `BRANCH_SETTINGS`, the two branch settings with one description, and every shipped schema that declares them spreads it in place of its own wording. The command gate, the plan check and the three workflows that opened pull requests ask their context instead of building a `Git` and a second copy of its layout. The settings stay per plugin, so no `config.yaml` changes; the plan check's `baseBranch` now defaults to `{}` like every other's.

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-command-gate`, `@amykit/plugin-file-worktree`, `@amykit/plugin-github`, `@amykit/plugin-plan-check`, `@amykit/workflow-errand`, `@amykit/workflow-feature-grooming`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-ticket-to-qa`



### **The README now derives its mutable facts from the code and policy that own them.**

`patch` · `@amykit/cli`

The published command declares its Node requirement to npm. The README's Node
badge, command table and factory counts are generated with the rest of the
documentation, so `npm run docs:check` names the README when one falls behind.

### **The roster belongs to its workflow.** The team list that names who reviews and who owns QA is one ticket-to-qa profile's file, written by `init` and `add` beside the profile's records and confirmed by `amy roster confirm` — the workflow brought its command and its check with it, and none of the host's source names the file any more. Where a profile has no roster of its own, the workflow's red check names the file the machine kept where the roster used to live, so the error is a way back and not a dead end.

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-linear`, `@amykit/workflow-ticket-to-qa`

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

### The declaration the `amy-workflow` skill shows declares `policy.maxAttempts` in its `configSchema`, with the same default its policy reads. Before, it left the schema empty, and the mount refuses a policy key the schema does not declare, so a workflow copied from the skill did not boot.

`patch` · `@amykit/cli`



### 

`` · 



### **Waiting is not trying.**

`minor` · `@amykit/core`

The core now records `looks` separately from `attempts`: waits and logistical
acts are visible without consuming an attempt ceiling. `looksIn` and
`attemptsIn` make the distinction explicit, an `act` may be marked
`{ attempt: false }`, and an action result can return `notATry` to refund a
pre-charged attempt and delay the next look.

<!-- amy:end changelog-unreleased -->

## Released

<!-- amy:generated changelog-releases -->

No release has been cut yet. The release workflow is deliberately dormant until
somebody arms it, so this is the truth rather than a fetch that failed —
see [the release path](../development/releasing.md).

<!-- amy:end changelog-releases -->

## Per-package changelogs

Each package carries its own `CHANGELOG.md`, written by `changeset version`. The
news above is the whole workspace; a package's own file is the one to read when
you depend on exactly that package.

## How a change gets here

Every change a user would notice needs a changeset:

```sh
npm run changeset
```

Written for somebody reading it six months from now: **what changed, and why it
was wrong before.** A changelog entry that says what the diff says is one nobody
gains anything from reading.

See [Releasing](../development/releasing.md).

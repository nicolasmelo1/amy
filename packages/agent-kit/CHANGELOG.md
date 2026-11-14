# @amykit/agent-kit

## 0.8.0

### Minor Changes

- a41a17f: **A shipped workflow runs as a phase.** A project walking BRIEF → WORK → PROVE on amy's own pieces stopped three times in 0.7.1, and the whole-project example hid all three. It never ran ticket-to-qa (it set the WORK child to `DONE` by hand), and it ran actions without the boot check the daemon makes.
  
  - **The unit a called record is for is the core's.** A called record's id is `SHOP-1/WORK#1`. ticket-to-qa asked the tracker for that id as a ticket, and its review lane did the same. errand and note-to-plan looked for a task and a note under it. prove, feature-grooming and the worktree plugin each kept a private split on `/`. `unitOf(record)` from `@amykit/core` now says what the unit is at any depth, keeping a root's `@repository`, and every one of them uses it. `L0.A_CALLED_RECORD_NAMES_ITS_UNIT` refuses a split of an id on `/` or `#` outside the core.
  - **The testkit walks every world called as a phase too.** `conformance` and `conforms` now walk each world a second time as `UNIT/PHASE#1`, under a new property, "called as a phase, it does what it does standing alone". The two walks must make the same tracker, code-host and conversation calls, plan the same actions and come to rest in the same state. A world that keeps state gives `again()` to be rebuilt, and `said()` with `watched()` to say what its ports were asked. A checkout or an agent's context may still key on the record's own id.
  - **A claude run that may write can write.** A print-mode run with no `--permission-mode` and the user's settings dropped is refused every edit, so a writing step answered and changed nothing. The new `permissionMode` setting (default `acceptEdits`; `auto` or `bypassPermissions` also allowed) is now always passed, and a read-only run is still `plan`. An empty, unknown or non-writing mode is refused at mount, naming the setting. `harnessConformance` in agent-kit holds claude and codex to it.
  - **A core action's name means the core's action.** prove's gave-up notice was a handler named `escalate`, the core's tracker write, so the mount counted a write prove never makes, for a tracker it does not need. It is now `give-up`. prove's own actions also reached no catalogue, so called as a phase it was refused ("action `lease`: nothing defines it"). A workflow's `catalogue` now declares its own actions on ports it needs, and the composed workflow carries every callee's to the mount. A handler under a core action's name, in a workflow that does not need that action's port, is refused at boot.
  - **A called phase is counted as it is standing alone.** A workflow's catalogue entry is now the port its handler reaches, so prove's agent step, now its own `run-agent-step` catalogued on `agent`, is counted by the budget through every call (it ran while the budget refused agent work), while a deterministic or `wait-until` step stays a `run-step` the budget does not hold; prove still boots with no agent mounted. A called workflow's `store` (by the name it asks for, whatever its call binds it to) lists its own records under every root rather than its caller's roots, so errand's `maxInFlight` and note-to-plan's `maxOpenPlansPerRepo` count errands and plans called as phases.
  - **A unit has one conversation, and reading it opens none.** `Conversation` gains a required `known(workId)`, which answers the thread a work already has and creates nothing. Slack, Telegram and the terminal implement it, and a conversation adapter of your own must too. ticket-to-qa reads replies through it, so a look that only reads leaves no thread behind. A called phase's threads are the unit's, titled by the ticket, setup's included. The notifier posts into the unit's thread too, instead of opening one under the call's id.

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

- 2b4deec: **A run carries only what amy hands it.** The three agent CLIs amy drives used to carry the operator's own setup into a ticket run and write back into it. Now each run is kept apart:
  
  - **Claude** runs with `--setting-sources project,local --strict-mcp-config --no-session-persistence`. The operator's `CLAUDE.md`, hooks, plugins, MCP servers and skills stay out, and no session or auto-memory is written under `~/.claude/projects`. The repository's own settings still load. A step whose skill ladder names a skill is lent that one skill through `--add-dir`, and nothing else of the operator's.
  - **Codex** runs with `--ignore-user-config --ephemeral --disable hooks --disable plugins --disable apps --disable memories`. The login still comes from `CODEX_HOME`, and `~/.codex/AGENTS.md` and user skills still load, since Codex has no switch for them.
  - **Hermes** runs in its own profile, `hermes -p amy`, set by the new `profile` setting. `amy init` and `amy add` create that profile from the active one when it is missing, with memory, unasked skill writes and the curator turned off. `amy doctor` goes red, naming the fix, when the profile is missing or has any of those turned back on.
  
  **A plugin can prepare something outside amy's state.** `Plugin.setup` is run by `amy init` and `amy add` after a plugin's files. A setup gets the plugin's settings and a command runner, answers the way a check does, and one that throws is reported without stopping the next. `AskContext.skill` carries the skill a relay addressed the prompt to, with the directory it is installed in.
- 5c705d2: Harness subscriptions report their account-usage windows through `amy status` and `amy budget`.

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

## 0.6.0

### Patch Changes

- Updated dependencies [9e3cb22]
  - @amykit/core@0.6.0

## 0.5.0

### Minor Changes

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
- 9bb3d24: Park an opted-in workflow before it spends another agent run with no new evidence.

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

- 2dc9117: A brief reaches every ticket it explains.
  
  Tickets may inherit a shared brief from their Linear parent. The workflow reads
  that brief freshly on every observation, carries it to triage, implementation,
  review and its self-review half-step, records questions against it, and keeps a
  brief only while its explained work remains non-terminal or inside retention.
  `amy brief <id>` renders the mounted brief without exposing its store path.
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
- 64b4d24: The answer on the ticket reaches the agent, and the tracker stops carrying
  progress notices.
  
  `hasReplyAfter` could say *whether* a ticket was answered and never *what* was
  said, so `CLARIFYING` re-ran triage on an unchanged ticket, got the same
  questions back, and asked them again until it ran out of attempts — the one
  path built for "a human knows something the ticket does not" threw that
  knowledge away on arrival. The port gains `comments(ticketId, since?)`
  returning `{ author, body, at, fromAmy }`, with `fromAmy` settled by the
  tracker's own account of who wrote each comment; `hasReplyAfter` stays as the
  cheap boolean a waiting state polls with, and still fetches no text. An
  answered question now moves the work on: the state re-reads the ticket with
  the conversation attached, amy's own comments labelled as questions it already
  asked, and the second look never repeats a question the answer closed. The
  `triage` and `implement` prompts carry that conversation, attributed.
  
  `plugin-linear` also stops contributing its notification channel: a tracker
  comment is for a question that needs a person, and `failing`, `recovered` and
  `gave-up` are for the operator's channels. That removes the pollution —
  progress notices commented on a ticket under the operator's own name — rather
  than teaching every reader to filter it. `notify.tracker` is gone with it.
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
- a499e82: The ticket's description reaches the agent's prompt, instead of an instruction
  to go and read a page it cannot open.
  
  `ISSUE_FIELDS` asked Linear for `id`, `identifier`, `title`, `url`,
  `branchName`, `state` and `team` — not `description` — so `Ticket` had no body
  and never could have one. `triage` and `implement` then built their prompts
  from the title and the tracker URL, and told the agent to "read the ticket":
  an instruction nothing under `claude -p` could obey, with no credential and no
  browser. The visible failure was an honest refusal; the expensive one was a
  ticket whose title sounded sufficient producing a full implementation that
  never saw the description's acceptance criteria, its named file, or the
  ownership boundary written in it — on an install where that duplicated an open
  pull request, 8 files and +615 lines on a 2-point ticket.
  
  Now the fetch asks for `description`, `toTicket` maps it to `body` (absent
  stays absent — an empty description is a real state, not an error), and the
  prompts carry the body where the work is judged by it. A ticket with no body
  says `(this ticket has no description)` rather than looking truncated, which is
  what lets the agent ask for one instead of inventing one. A tracker that
  supplies no body is unaffected: the field is optional and the prompt names the
  case it is in.
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
  - @amykit/workflow-ticket-to-qa@0.3.1

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

- Updated dependencies [e603b3b]
- Updated dependencies [7ec6c02]
  - @amykit/core@0.3.0
  - @amykit/workflow-ticket-to-qa@0.3.0

## 0.2.0

### Minor Changes

- e955a7d: A ladder per step, so the cheap step can reach a cheap model.
  
  One ladder for the whole install was the right default and the wrong ceiling.
  Reading a ticket to decide whether it is clear enough to start is not the same
  job as writing the change, and putting both behind one list means paying the
  expensive model to do the cheap step, or asking the cheap one to do the work.
  
  ```yaml
  agent:
    ladder: [claude:sonnet, claude:opus]
    ladderByStep:
      triage: [claude:haiku]
      implement: [claude:opus]
  ```
  
  Keyed by the workflow's action name, which the relay already had in hand for
  choosing a skill — so this is a lookup where there was an array, not new
  plumbing. A step that names no ladder uses the one above it, and so does an
  install that sets none, which is every install today.
  
  **Which is what makes routing by difficulty possible without anything here
  learning the word.** A workflow that triages into easy and hard emits
  different actions for each, and the config points them at different rungs. The
  relay never finds out what "hard" means.
  
  The two ladders stay separate concerns: a step picks one, and the failure
  ladder is then climbed *inside* it. Falling back to the default when a rung
  fails would mean an operator who asked for a cheap model got the expensive one
  every time the cheap one wobbled.
  
  A name inside `ladderByStep` mounts its harness and contributes its model tier
  exactly as a name in `ladder` does. Reading only the default would have refused
  that mount at boot — correctly, but for a reason nobody could see from the
  config they wrote.

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
  - @amykit/workflow-ticket-to-qa@0.2.0

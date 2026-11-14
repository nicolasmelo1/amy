# @amykit/plugin-claude

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
  - @amykit/model-specs@0.8.0

## 0.7.1

### Patch Changes

- Updated dependencies [e79dea1]
  - @amykit/core@0.7.1
  - @amykit/agent-kit@0.7.1
  - @amykit/model-specs@0.7.1

## 0.7.0

### Minor Changes

- b761f29: **A config is typed by its schema.** `definePlugin` gives a plugin's register and ready hooks the post-validation type derived from its schema, rejects mismatched defaults, and moves every shipped schema onto that declaration. Scalar and `string[]` settings no longer cast away the host's validation; record settings remain explicitly narrowed where a plugin needs a stronger value shape.
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
- 5c705d2: Harness subscriptions report their account-usage windows through `amy status` and `amy budget`.
- 3649573: Plugin versions and unused workflow observer declarations were removed; package manifests supply displayed versions.

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
- Updated dependencies [5c705d2]
- Updated dependencies [3649573]
- Updated dependencies [f4069bb]
- Updated dependencies [09cb74f]
- Updated dependencies [f9b65f6]
- Updated dependencies [37504c1]
- Updated dependencies [2363da5]
- Updated dependencies [0ef3ae3]
- Updated dependencies [0815efb]
  - @amykit/core@0.7.0
  - @amykit/agent-kit@0.7.0
  - @amykit/model-specs@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [9e3cb22]
  - @amykit/core@0.6.0
  - @amykit/agent-kit@0.6.0
  - @amykit/model-specs@0.6.0

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
  - @amykit/agent-kit@0.5.0
  - @amykit/model-specs@0.5.0

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
- Updated dependencies [64b4d24]
- Updated dependencies [c30789e]
- Updated dependencies [fc6748a]
- Updated dependencies [5b37451]
- Updated dependencies [bfda1ac]
- Updated dependencies [a499e82]
- Updated dependencies [f1557f6]
  - @amykit/core@0.4.0
  - @amykit/agent-kit@0.4.0
  - @amykit/model-specs@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [4b54a6f]
  - @amykit/core@0.3.1
  - @amykit/agent-kit@0.3.1
  - @amykit/model-specs@0.3.1

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

### Patch Changes

- Updated dependencies [e603b3b]
- Updated dependencies [a0ec22e]
  - @amykit/model-specs@0.3.0
  - @amykit/agent-kit@0.3.0
  - @amykit/core@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [e955a7d]
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
  - @amykit/agent-kit@0.2.0
  - @amykit/model-specs@0.2.0
  - @amykit/core@0.2.0

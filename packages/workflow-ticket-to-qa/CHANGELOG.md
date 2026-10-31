# @amykit/workflow-ticket-to-qa

## 0.7.0

### Minor Changes

- b761f29: **A config is typed by its schema.** `definePlugin` gives a plugin's register and ready hooks the post-validation type derived from its schema, rejects mismatched defaults, and moves every shipped schema onto that declaration. Scalar and `string[]` settings no longer cast away the host's validation; record settings remain explicitly narrowed where a plugin needs a stronger value shape.
- 2c7324c: **A mount builds once.** `port`, `engine` and `contribute` accept `deferred(() => impl)`: the host builds it once every plugin has registered, once per mount and before any `ready`, building on demand when one reads another, so the order plugins are listed in does not matter. A build that throws is a boot refusal naming its plugin, and two builds that read each other are refused naming both. The agent relay, the serial engine and the three shipped workflows use it in place of their own `WeakMap<PluginContext, …>`, getter proxies and build-early `ready`. One behaviour change: the serial engine is now built at boot, so an engine with no workflow, no runtime or no queue, store or notifier is refused when the host mounts rather than on its first tick.
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
- 3649573: Plugin versions and unused workflow observer declarations were removed; package manifests supply displayed versions.
- 2363da5: **The host lends the checkout.** `PluginContext` gains `checkouts()`, which answers with the `Git` and the layout for the calling plugin — the host's paths, the plugin's own `defaultBranch` and `baseBranch`, and the `worktree` port read whenever a path is asked for, so a worktree plugin listed after the caller is still the one used. The core exports `BRANCH_SETTINGS`, the two branch settings with one description, and every shipped schema that declares them spreads it in place of its own wording. The command gate, the plan check and the three workflows that opened pull requests ask their context instead of building a `Git` and a second copy of its layout. The settings stay per plugin, so no `config.yaml` changes; the plan check's `baseBranch` now defaults to `{}` like every other's.

### Patch Changes

- Updated dependencies [b761f29]
- Updated dependencies [2c7324c]
- Updated dependencies [ebae48c]
- Updated dependencies [989f399]
- Updated dependencies [7d2dd00]
- Updated dependencies [da95fc7]
- Updated dependencies [b83a214]
- Updated dependencies [3649573]
- Updated dependencies [f9b65f6]
- Updated dependencies [37504c1]
- Updated dependencies [2363da5]
- Updated dependencies [0815efb]
  - @amykit/core@0.7.0
  - @amykit/agent-kit@0.7.0

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

### Patch Changes

- Updated dependencies [9e3cb22]
  - @amykit/core@0.6.0
  - @amykit/agent-kit@0.6.0

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
- 8b2fcc8: Let a workflow ask and hear an operator in a work-scoped conversation instead of the tracker.
- 9bb3d24: Park an opted-in workflow before it spends another agent run with no new evidence.
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
  - @amykit/agent-kit@0.5.0

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

## 0.3.0

### Minor Changes

- 7ec6c02: Nothing is installed by default: the command arrives alone, the first workflow is the one the person there names or writes.
  
  `@amykit/cli` depends on no workflow and no notifier. The roster the ticket workflow reads is contributed by the host under the name the workflow looks up — spelled where the file is read, not imported — and whether a Hermes target is reachable is asked of the `notify` port the mounted channel contributes.
  
  `SHIPPED_PROFILES` is empty: a config with no `workflows:` block drives nothing, and every command that needs one says so and names `amy workflow new` and `amy add`. `EXAMPLE_CONFIG` keeps the two published workflows as commented examples, its plugin slices commented with them, and `amy init` writes its files and installs nothing. A machine with nothing mounted is still diagnosed: `amy doctor` reports everything it can see and names the missing workflow in the selection's own words.
  
  New gate `bare-install`: the scenario installs the command alone onto a machine with none of it and proves what it can and cannot do — twelve assertions, from "the command arrives alone" to "doctor asks the port, not the package".

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

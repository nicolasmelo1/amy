# @amykit/core

## 0.2.1

No changes in this release.

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

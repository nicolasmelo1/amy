# @amykit/plugin-linear

## 0.4.0

### Minor Changes

- c30789e: Add provider-neutral feature grooming with read-only base-branch snapshots and reconciliation provenance.

### Patch Changes

- 2dc9117: A brief reaches every ticket it explains.
  
  Tickets may inherit a shared brief from their Linear parent. The workflow reads
  that brief freshly on every observation, carries it to triage, implementation,
  review and its self-review half-step, records questions against it, and keeps a
  brief only while its explained work remains non-terminal or inside retention.
  `amy brief <id>` renders the mounted brief without exposing its store path.
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
  - @amykit/workflow-ticket-to-qa@0.3.1
  - @amykit/plugin-notify-fanout@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [e603b3b]
- Updated dependencies [7ec6c02]
  - @amykit/core@0.3.0
  - @amykit/workflow-ticket-to-qa@0.3.0
  - @amykit/plugin-notify-fanout@0.3.0

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
  - @amykit/workflow-ticket-to-qa@0.2.0
  - @amykit/plugin-notify-fanout@0.2.0

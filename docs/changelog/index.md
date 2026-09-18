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

### A brief reaches every ticket it explains.

`patch` · `@amykit/agent-kit`, `@amykit/cli`, `@amykit/core`, `@amykit/plugin-file-store`, `@amykit/plugin-linear`, `@amykit/workflow-ticket-to-qa`

Tickets may inherit a shared brief from their Linear parent. The workflow reads
that brief freshly on every observation, carries it to triage, implementation,
review and its self-review half-step, records questions against it, and keeps a
brief only while its explained work remains non-terminal or inside retention.
`amy brief <id>` renders the mounted brief without exposing its store path.

### A checkout root per repository.

`patch` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-claude`, `@amykit/plugin-codex`, `@amykit/plugin-command-gate`, `@amykit/plugin-file-worktree`, `@amykit/plugin-hermes-agent`, `@amykit/plugin-plan-check`, `@amykit/workflow-errand`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-ticket-to-qa`

`checkouts:` maps a repository to its own path beside `workspaceRoot`; a
repository named there is never looked for under the root at all, `~` expands
the way the root's does, and a config without the block resolves exactly as
before. The map rides the host paths and every `Git` layout to the worktree
manager, which cuts a named repository's trees from its own checkout, and
`amy doctor` names which root it asked for each repository.

### A reply inside a review thread reaches the agent.

`patch` · `@amykit/agent-kit`, `@amykit/core`, `@amykit/plugin-github`

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

### The answer on the ticket reaches the agent, and the tracker stops carrying progress notices.

`patch` · `@amykit/agent-kit`, `@amykit/plugin-linear`, `@amykit/workflow-ticket-to-qa`

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

### `amy status` stops listing work that has finished.

`minor` · `@amykit/cli`

A record in a terminal state is done: `discover` already refuses to queue it,
so it costs nothing to keep — but it never left the listing on its own, and a
list that only grows stops being read. Finished records are counted below the
table instead, `amy status --all` prints them, and `--json` marks each record
with `finished` so a page can make the same cut. Nothing is deleted and the
log still keeps what the work did.

Nothing is hidden when the workflow will not mount, because a mount that
failed is exactly when somebody wants every row.

### The forge is asked, not run beside.

`patch` · `@amykit/core`, `@amykit/plugin-github`, `@amykit/plugin-linear`, `@amykit/workflow-ticket-to-qa`

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

### The ports belong to the core.

`patch` · `@amykit/agent-kit`, `@amykit/core`, `@amykit/plugin-agent-relay`, `@amykit/plugin-command-gate`, `@amykit/plugin-github`, `@amykit/plugin-linear`, `@amykit/plugin-serial-engine`, `@amykit/workflow-ticket-to-qa`

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

### The threads close when they are answered.

`patch` · `@amykit/core`, `@amykit/plugin-github`, `@amykit/workflow-ticket-to-qa`

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

### The ticket's description reaches the agent's prompt, instead of an instruction to go and read a page it cannot open.

`patch` · `@amykit/agent-kit`, `@amykit/plugin-linear`, `@amykit/workflow-ticket-to-qa`

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

### The worktree is the workplace.

`minor` · `@amykit/agent-kit`, `@amykit/cli`, `@amykit/core`, `@amykit/plugin-claude`, `@amykit/plugin-codex`, `@amykit/plugin-command-gate`, `@amykit/plugin-file-worktree`, `@amykit/plugin-hermes-agent`, `@amykit/plugin-plan-check`, `@amykit/workflow-errand`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-ticket-to-qa`

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

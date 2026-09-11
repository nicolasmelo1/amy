# The forge is asked, not run beside

Two adapters live in a workflow package somewhere, and neither of them
should exist. One shells out to `gh` beside the plugin that already owns
`gh`; the other opens its own GraphQL connection to Linear beside the
tracker that already has one. Everything in both is the plugins' job.

This is not a complaint about the ports being small. It is that **every gap
in a port becomes an adapter in whoever hits it**, and the second workflow
that hits the same gap writes it again.

## What the adapters contain, and where each thing belongs

The `gh` adapter exists for eleven methods. Three of them are answered by
plans already in the order: `resolveThread` by
[the threads close when they are answered](the-threads-close-when-they-are-answered.md),
`reviewsRequestedOf` (which was broken, and found because this workflow was
its first consumer) by
[no port method ships unproven](no-port-method-ships-unproven.md), and
`mergedAndBase` by the view growth below. The rest:

| the workflow needed | why the port did not have it |
| --- | --- |
| `merge` | `CodeHost` cannot merge |
| `submitReview` | `CodeHost` cannot review |
| `createIssue` | no port files an issue |
| `pullRequest(repo, number)` | `findPullRequest` takes a branch, and a review request only ever knows a number |
| `merged`/`base` on the view | `PullRequestView` carries neither |
| `ticketsWithChangesRequested` | discovery by review state; nothing offers it |
| `freezeIsClear` | commit statuses, which no ruleset enforces |

The Linear reader exists for three: `description` and `comments` are
[the ticket body](../docs/design/the-ticket-body-reaches-the-agent.md) and
[an answer](an-answer-reaches-the-agent.md) already; `labels` is below. A
label is how a team says what a ticket *is*: two epics labelled `Feature`
were picked up as work to implement, and their sub-issues were the actual
tickets.

## What it costs

- `gh` is invoked from two places with two shapes. One retries, one does
  not; one reports the exit code, one reported an empty string for a killed
  process for a day.
- The same pull request is read twice per look — once by the port for its
  threads, once by the forge for `merged` and `base`.
- The mount has to claim a port kind of its own, because `code-host` is
  taken and claiming a kind twice is refused — so the registry says there
  are two code hosts, and one of them is a workflow.
- `LINEAR_API_KEY` is read by the plugin and, separately, by a reader inside
  a workflow. Two clients, two caches, one key.
- The next workflow that answers a review thread or reads a ticket body
  writes all of this again.

## What changes

**The tracker carries what a ticket is.** `ISSUE_FIELDS` grows
`labels { nodes { name } }` (`plugins/linear/src/LinearTracker.ts:16`) and
`Ticket` grows `labels: string[]`. With the description and the comments
from the two plans above, the Linear reader has nothing left in it.

**The forge answers by number, and says what a pull request is.**
`CodeHost` grows `pullRequest(repo, number)` — readable merged or not,
because the open-only filter belongs to the by-branch search — and
`PullRequestView` grows `merged` and `base`, from the same node in the same
query.

**The forge does what a workflow would otherwise shell out for.** It grows
`merge(repo, number, method)` — the method the base's ruleset allows is the
caller's to name, so the port stays domain-free; `submitReview(repo, number,
review)`, with the state as forge vocabulary and the decision to submit as
workflow policy; `createIssue(repo, { title, body })`; and
`commitStatuses(repo, sha)`, so a freeze is a workflow's reading of a status
list rather than a private `gh api` of its own.

**Discovery by review state.** `reviewsRequestedOf` answers "what is waiting
on my review"; the missing mirror is "where did my review leave changes
requested", which is the search behind `ticketsWithChangesRequested`. It
grows as one more scoped search on the same port, and the workflow filters
by state.

What stays in the workflow is policy: which review state to submit, whose
thread to close, what counts as a freeze. With the port grown, those are
decisions over port answers rather than a second `gh` — and
[no port method ships unproven](no-port-method-ships-unproven.md) is what
keeps each new method honest on arrival.

## The gate

Every method above lands with an adapter test asserting the argv against
the scripted runner, which the guardrail plan then holds in place. The
Linear change lands beside the existing `ISSUE_FIELDS` mapping tests.

## Acceptance criteria

- [ ] A pull request is readable by number, merged or not
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [ ] The view says whether a pull request merged and what its base is
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [ ] A pull request is merged through the port, by the method the caller
      named (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [ ] A review is submitted through the port
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [ ] An issue is filed through the port
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [ ] A commit's statuses are readable through the port, freeze or no
      freeze (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [ ] A ticket carries its labels
      (proof: test:plugins/linear/tests/LinearTracker.test.ts)
- [ ] The private workflow deletes both adapters
      (proof: unspecified:the deletion happens in a repository this one does
      not contain; what this plan ships is every port method the adapters
      were compensating for)

**Exit condition:** a workflow that needs what the plugins know asks the
mounted plugin, and no registry ever again says there are two code hosts
because a workflow had to mount one of its own.
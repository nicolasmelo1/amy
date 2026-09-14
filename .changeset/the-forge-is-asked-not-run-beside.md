---
"@amykit/core": patch
"@amykit/plugin-github": patch
"@amykit/plugin-linear": patch
"@amykit/workflow-ticket-to-qa": patch
---

The forge is asked, not run beside.

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
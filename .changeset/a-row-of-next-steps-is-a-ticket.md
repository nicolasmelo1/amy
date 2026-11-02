---
"@amykit/plugin-next-steps": minor
---

A row of next steps is a ticket. `@amykit/plugin-next-steps` mounts the
`tracker` port over an execution-order table — `plans/next-steps.md` by
default — read from the base branch, never from the standing checkout: a row
is a work item, its linked plan the body, its place in the table the
priority. A relative link is a plan in the table's repository, its id the
slug; an `owner/name:plans/<slug>.md` link is one in another, its id
`owner/name:<slug>`, so one table can order the work of several. Only the top `rows` (one by default) are work at once, a row
gone from the table with its plan in `docs/design/` reads as `delivered`, and
the branch is `branchPrefix` (`plan/` by default) and the plan's slug.

It writes nothing: mount `ticket-to-qa` on it with `policy.writes: operator`
and `qaStatusName: delivered`, and a row reaches delivered when you merge the
pull request that moves its plan.

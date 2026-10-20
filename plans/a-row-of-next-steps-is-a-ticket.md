# A row of next steps is a ticket

A repository that decides its work in `plans/` and orders it in
`plans/next-steps.md` already has a tracker. It is a table: a row is a piece of
work, the plan it links is the body, the order is the priority, and a row that
leaves the table — the plan moved to `docs/design/` and named under
*Delivered* — is done. This repository works that way, and so do the others
`note-to-plan` writes plans into, because `sf check` refuses a plan with no
exit condition or no place in the order.

`ticket-to-qa` cannot walk one of those rows. Its work comes from a `Tracker`
(`packages/core/src/ports/Ticketing.ts`), and the only trackers are Linear and
the task file the errand keeps. So the one workflow that knows how to go from
work to a reviewed pull request cannot be pointed at the work this kind of
repository has decided to do, and a private workflow that wants it writes the
reader itself.

## What is read

An adapter, `@amykit/plugin-next-steps`, implements `TrackerReads` over one
table:

- **`inProgress()`** is the rows of the execution-order table, in order, read
  from the configured base branch through `BaseSource` — never from a standing
  checkout somebody may be editing. A row's link is its plan.
- **`get(id)`** is the row whose plan slug is `id`, as a `Ticket`: the plan's
  title, the plan file as the body, the repository it lives in as `repo`, the
  blob URL at the commit that was read as `url`, and the status `ready`.
  A slug that is no longer in the table, and whose plan sits in
  `docs/design/`, is the status `delivered`.
- **`comments()`** and **`hasReplyAfter()`** are empty. A plan has no comment
  thread; the conversation about it is the `Conversation` port's.

The table may be in the repository its plans are in, or it may be a table of
its own whose links point into several repositories — one order across them.
A link is a relative path for the first and `owner/name:plans/<slug>.md` for
the second, and `repo` follows the link, not the table.

## What is not written

Nothing. The adapter declares no tracker writes. A row reaches *Delivered*
because a person merges the pull request that moves it, which is the review the
order deserves. A workflow mounting this tracker runs with
`policy.writes: operator`, and [a workflow that claims no writes cannot reach
one](../docs/design/a-workflow-that-claims-no-writes-cannot-reach-one.md) holds
it to that.

## What a precondition is

Not this adapter's. A plan's precondition is read in the repository it is about
by the workflow that walks it. The tracker reports the row; whether the row can
start is a decision.

## Acceptance criteria

- [ ] The rows of an execution-order table come back from `inProgress()` in
      the table's order (proof: deferred:test:plugins/next-steps/tests/NextStepsTracker.test.ts)
- [ ] A row is read from the base branch through `BaseSource`, and an
      uncommitted edit to the standing checkout changes nothing
      (proof: deferred:test against a bare origin and a dirty clone)
- [ ] `get()` returns the plan as the body and the repository the link points
      into as `repo`, for a relative link and for an `owner/name:` link
      (proof: deferred:test:plugins/next-steps/tests/NextStepsTracker.test.ts)
- [ ] A row that left the table with its plan in `docs/design/` reads as
      `delivered`, and one that left it with no design note reads as gone
      (proof: deferred:test:plugins/next-steps/tests/NextStepsTracker.test.ts)
- [ ] The plugin declares no tracker writes and the mount hands it none
      (proof: deferred:assertion in the plugin's end-to-end scenario)
- [ ] `ticket-to-qa` walks a row of a real table to an open pull request in a
      testkit world, with no tracker write in its log
      (proof: deferred:scenario through the installed executable)

**Exit condition:** `ticket-to-qa`, mounted on a `next-steps.md` table, takes
its first row from the base branch, walks it to a pull request in the
repository the row's plan lives in, and writes nothing anywhere a tracker would
have been.

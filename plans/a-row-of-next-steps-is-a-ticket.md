---
sources:
  - { id: S1, kind: friction, ref: "plans/next-steps.md", said: "a repository ordering its plans in plans/next-steps.md already has a tracker: a row is a piece of work, its linked plan the body, the order the priority" }
  - { id: S2, kind: friction, said: "a row that leaves the table, its plan moved to docs/design/ and named under Delivered, is done; this repository and those note-to-plan writes into work so, as sf check refuses a plan without exit or order place" }
  - { id: S3, kind: code, ref: "packages/core/src/ports/Ticketing.ts", said: "ticket-to-qa's work comes from a Tracker; the only trackers are Linear and the errand's task file, so a private workflow wanting these rows writes the reader itself" }
  - { id: S4, kind: decision, said: "an adapter, @amykit/plugin-next-steps, implements TrackerReads over one table" }
  - { id: S5, kind: decision, ref: "packages/core/src/ports/BaseSource.ts", said: "inProgress() is the execution-order table's rows, in order, read from the configured base branch through BaseSource, never from a standing checkout somebody may be editing; a row's link is its plan" }
  - { id: S6, kind: decision, said: "get(id) is the row whose plan slug is id, as a Ticket: the plan's title, the plan file as body, its repository as repo, the blob URL at the commit read as url, status ready" }
  - { id: S7, kind: decision, said: "a slug no longer in the table whose plan sits in docs/design/ is the status delivered" }
  - { id: S8, kind: decision, ref: "packages/core/src/ports/Conversation.ts", said: "comments() and hasReplyAfter() are empty: a plan has no comment thread; the conversation about it is the Conversation port's" }
  - { id: S9, kind: decision, said: "the table may be in its plans' repository, or a table of its own whose links point into several repositories: one order across them" }
  - { id: S10, kind: decision, said: "a link is a relative path for the first and owner/name:plans/<slug>.md for the second; repo follows the link, not the table" }
  - { id: S11, kind: decision, said: "nothing is written: the adapter declares no tracker writes; a row reaches Delivered because a person merges the pull request that moves it, the review the order deserves" }
  - { id: S12, kind: reference, ref: "docs/design/a-workflow-that-claims-no-writes-cannot-reach-one.md", said: "a workflow mounting this tracker runs with policy.writes: operator, and a workflow that claims no writes cannot reach one holds it to that" }
  - { id: S13, kind: decision, said: "a plan's precondition is not this adapter's: the workflow walking it reads it in the repository the plan is about; the tracker reports the row, whether it can start is a decision" }
touches:
  - plugins/next-steps/**
criteria:
  - { id: A1, statement: "the rows of an execution-order table come back from inProgress() in the table's order", proof: "deferred:test:plugins/next-steps/tests/NextStepsTracker.test.ts", sources: [S1, S4, S5] }
  - { id: A2, statement: "a row is read from the base branch through BaseSource, and an uncommitted edit to the standing checkout changes nothing", proof: "deferred:test against a bare origin and a dirty clone", sources: [S5] }
  - { id: A3, statement: "get() returns the plan as the body and the repository the link points into as repo, for a relative link and for an owner/name: link", proof: "deferred:test:plugins/next-steps/tests/NextStepsTracker.test.ts", sources: [S6, S8, S9, S10] }
  - { id: A4, statement: "a row that left the table with its plan in docs/design/ reads as delivered, and one that left it with no design note reads as gone", proof: "deferred:test:plugins/next-steps/tests/NextStepsTracker.test.ts", sources: [S2, S7] }
  - { id: A5, statement: "the plugin declares no tracker writes and the mount hands it none", proof: "deferred:assertion in the plugin's end-to-end scenario", sources: [S11, S12] }
  - { id: A6, statement: "ticket-to-qa walks a row of a real table to an open pull request in a testkit world, with no tracker write in its log", proof: "deferred:scenario through the installed executable", sources: [S3, S11, S12, S13] }
guarantee:
  - { holds: "the next-steps tracker writes nothing; a row reaches Delivered only when a person merges the pull request that moves it" }
cut:
  - "tracker writes of any kind (comment, status, assign, follow-up): the adapter declares none (S11)"
  - "a plan's comment thread: none; the conversation is the Conversation port's (S8)"
  - "deciding a plan's precondition in the adapter: the walking workflow decides it (S13)"
exit: "ticket-to-qa, mounted on a next-steps.md table, takes its first row from the base branch, walks it to a pull request in the repository the row's plan lives in, and writes nothing anywhere a tracker would have been"
---
# A row of next steps is a ticket

Repositories that order their plans in `plans/next-steps.md` already have a tracker, but `ticket-to-qa` reads only Linear and the errand's task file.
So the workflow that goes from work to a reviewed pull request cannot be pointed at the work these repositories decided to do.

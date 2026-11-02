---
base: fbed1232a8743a897c7daf14c8882862e2c8008e
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
  - .software-factory/evidence/plugin-next-steps*
  - .software-factory/policy.yaml
  - docs/mechanisms.yaml
  - tsconfig.json
  - tsconfig.tests.json
untouched:
  - packages/workflow-ticket-to-qa/src/**
  - packages/core/src/**
  - plugins/linear/src/**
criteria:
  - { id: A1, statement: "the rows of an execution-order table come back from inProgress() in the table's order", proof: "test:plugins/next-steps/tests/NextStepsTracker.test.ts", sources: [S1, S4, S5], done: true }
  - { id: A2, statement: "a row is read from the base branch through BaseSource, and an uncommitted edit to the standing checkout changes nothing", proof: "assertion:next_steps.the_first_committed_rows_are_the_work", sources: [S5], done: true }
  - { id: A3, statement: "get() returns the plan as the body and the repository the link points into as repo, for a relative link and for an owner/name: link", proof: "test:plugins/next-steps/tests/NextStepsTracker.test.ts", sources: [S6, S8, S9, S10], done: true }
  - { id: A4, statement: "a row that left the table with its plan in docs/design/ reads as delivered, and one that left it with no design note reads as gone", proof: "test:plugins/next-steps/tests/NextStepsTracker.test.ts", sources: [S2, S7], done: true }
  - { id: A5, statement: "the plugin declares no tracker writes and the mount hands it none", proof: "assertion:next_steps.nothing_is_written_where_a_tracker_would_have_been", sources: [S11, S12], done: true }
  - { id: A6, statement: "ticket-to-qa walks a row of a real table to an open pull request in a testkit world, with no tracker write in its log", proof: "assertion:next_steps.each_row_walks_to_a_pull_request_in_its_plans_repository", sources: [S3, S11, S12, S13], done: true }
crosses:
  - { mechanism: tracker-and-host-writes, answer: works, proof: "assertion:next_steps.the_declaration_claims_no_tracker_writes (A5)" }
guarantee:
  - { holds: "the next-steps tracker writes nothing; a row reaches Delivered only when a person merges the pull request that moves it" }
cut:
  - "tracker writes of any kind (comment, status, assign, follow-up): the adapter declares none (S11)"
  - "a plan's comment thread: none; the conversation is the Conversation port's (S8)"
  - "deciding a plan's precondition in the adapter: the walking workflow decides it (S13)"
deviations:
  - "a branch per row: ticket-to-qa refuses a ticket with no branchName, and the plan named none; the tracker derives branchPrefix + slug, plan/ by default — the agent's choice, for the person to confirm"
  - "rows, default 1: only the top rows are work at once, so a table of forty plans starts one; S5 read every row. The exit's first row is the default — the agent's choice, for the person to confirm"
  - "a row in another repository has the id owner+name+slug, a file name on every system (second review), not the bare slug of S6: two repositories' plans of one name stay two work items, and a delivered one is found in its repository after its last row leaves the table and after a restart (first review); two different plans with one id are refused"
  - "a row is its table position as priority, 1 first, so a queue that orders by priority keeps the table's order"
  - "the end-to-end scenario stops at the pull request the exit names; the walk past it to delivered is the shipped workflow's, with qaStatusName: delivered"
  - "also touched: package.json's e2e list, the generated docs and locks, a changeset"
exit: "ticket-to-qa, mounted on a next-steps.md table, takes its first row from the base branch, walks it to a pull request in the repository the row's plan lives in, and writes nothing anywhere a tracker would have been"
---
# A row of next steps is a ticket

Repositories that order their plans in `plans/next-steps.md` already have a tracker, but `ticket-to-qa` reads only Linear and the errand's task file.
So the workflow that goes from work to a reviewed pull request cannot be pointed at the work these repositories decided to do.

---
base: 2c7b38dfc979b172247343b68ff110b6044a4b39
sources:
  - { id: S1, kind: code, ref: "examples/workflow-ticket-to-qa/src/plugin.ts", symbol: "call", said: "a lane is handed the input the calling record builds, and checkInput hands it the record's own id" }
  - { id: S2, kind: code, ref: "examples/workflow-ticket-to-qa/src/lanes.ts", symbol: "selfReviewLane", said: "the review resolves its brief by the work id its input carries, and calls that brief its own when the two match" }
  - { id: S3, kind: decision, said: "a project's phase record is named for the call (`PROJ-1239/WORKFLOW#1`); the brief a unit is worked against lives under the unit's work id, the one triage and the project's gate read" }
  - { id: S4, kind: friction, said: "the review read the brief under the call's id, and a brief store refuses an id with a slash, so the review of a project's phase failed before it asked" }
touches:
  - examples/workflow-ticket-to-qa/src/plugin.ts
  - examples/workflow-ticket-to-qa/src/lanes.ts
  - registry/workflow-ticket-to-qa.json
criteria:
  - { id: A1, statement: "the review of a unit a project walks reads the brief under the unit's work id, and labels it as its own", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/self-review.test.ts", sources: [S1, S2, S3, S4] }
  - { id: A2, statement: "the project's own walk reaches the self-review, and the review reads the same brief triage read", proof: "deferred:test:.software-factory/evidence/project-phases-scenario.sh", sources: [S2, S3] }
crosses:
  - { mechanism: briefs, answer: works, proof: "deferred:test:examples/workflow-ticket-to-qa/tests/self-review.test.ts" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "nothing is written: the call's input gains the unit's id, and the review only reads" }
guarantee:
  - { holds: "a review of a ticket worked in one repository and one worked in several resolve the same brief their triage read", not_against: "a packaged workflow with no project around it: the call id is the unit id, and nothing changes" }
failures:
  - { step: self-review, when: "no brief is stored under the unit's work id", goes_to: "the ticket's briefId is read, as before; a brief the store cannot read fails the look naming its id" }
cut:
  - "the ticket's id as a brief key: the unit's work id is the one the gate judged"
  - "re-resolving the brief inside ask-question: triage records the one it read"
exit: "the review a project's phase runs reads the brief its triage read, under the unit's work id, and calls it the brief the ticket is worked against"
---
# The review is handed the unit's work id

The call's id is the project's, the unit's brief is not: the review now reads
under the work id the unit is worked with, as triage and the project's gate do.

The e2e proof walks the shipped workflow to the review, so a slash in the
call's id cannot pass unnoticed again.

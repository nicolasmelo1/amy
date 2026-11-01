---
sources:
  - { id: S1, kind: friction, said: "a workflow is one lifecycle for the whole life of the work; the private workflow has twenty-one states, mostly polling waits, and each review round loops back through the same states" }
  - { id: S2, kind: decision, said: "a workflow may begin when something happens and end when it has dealt with it: ticket reaches working status → read → work → open PR → [*]; review submitted → judge → escalate on doubt → fix → push → [*]" }
  - { id: S3, kind: reference, ref: "plans/an-event-is-a-reason-to-look.md", said: "the edge out of [*] may name the starting event, read as on a waiting state's edge, e.g. [*] --> TRIAGE: code-host.review.submitted; polling stays the net under both" }
  - { id: S4, kind: decision, ref: "packages/core/src/diagram.ts", said: "each such event starts one record; a [*] edge naming no event is discovered as today; a workflow may be event-started and discovered as well" }
  - { id: S5, kind: decision, ref: "packages/core/src/define-workflow.ts", said: "defineWorkflow gains key, a function from the event to what the work is about, usually the ticket, which a code-host event finds through the pull request it names" }
  - { id: S6, kind: reference, ref: "plans/the-review-is-remembered-across-rounds.md", said: "runs of one key are one lineage sharing ticket and brief, what earlier review rounds settled, and attempts spent" }
  - { id: S7, kind: decision, said: "a run's id is its key and workflow, e.g. TBO-1/review#3; observe reads earlier runs' records in its lineage read-only through the store" }
  - { id: S8, kind: decision, said: "one run per key at a time: an event for a key whose run is still going wakes it rather than starting another; two reviews in a minute are one round" }
  - { id: S9, kind: reference, ref: "plans/an-escalation-brings-its-evidence.md", said: "amy show TBO-1 lists every run of every workflow with that key, in order, with history and evidence; the window draws the same" }
  - { id: S10, kind: decision, said: "ticket-to-qa's review loop, PR_OPEN through HUMAN_FIX and RE_REVIEW, becomes @amykit/workflow-review-round: starts on code-host.review.submitted, keyed by ticket, ends when the round is settled and pushed" }
  - { id: S11, kind: decision, said: "ticket-to-qa ends when the PR is open; merge and QA handoff are a third short workflow started by code-host.pull-request.merged" }
  - { id: S12, kind: decision, said: "the ticket-to-qa scenario drives all three through the installed executable with signed webhooks posted to amy serve on loopback, asserting two reviews a minute apart make one round and amy show tells the whole story; its gate requires both" }
  - { id: S13, kind: decision, said: "a mid-work wait stays a state an event wakes (CLARIFYING waiting on a reply); a workflow starts on an event only when what follows is new work. Both shapes stay valid; docs say which to reach for" }
touches:
  - packages/core/src/diagram.ts
  - packages/core/src/define-workflow.ts
  - packages/core/src/lineage.ts
  - packages/core/tests/lineage.test.ts
  - plugins/serial-engine/src/Worker.ts
  - packages/workflow-ticket-to-qa/workflow.mmd
  - packages/workflow-ticket-to-qa/src/machine.ts
  - packages/workflow-ticket-to-qa/src/record.ts
  - packages/workflow-review-round/**
  - packages/workflow-testkit/src/**
  - packages/workflow-testkit/tests/triggers.test.ts
  - packages/cli/src/index.ts
  - packages/cli/tests/show.test.ts
  - docs/build/write-a-workflow.md
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "an event named on a workflow's [*] edge starts one record keyed by the workflow's key; a second event for the same key while that run is going wakes it instead of starting another", proof: "deferred:test:packages/workflow-testkit/tests/triggers.test.ts", sources: [S2, S3, S4, S5, S8] }
  - { id: A2, statement: "a run reads the records of earlier runs in its lineage, read-only, and a write to one is refused", proof: "deferred:test:packages/core/tests/lineage.test.ts", sources: [S6, S7] }
  - { id: A3, statement: "amy show <key> lists every run of every workflow with that key, in order, with each one's history and evidence", proof: "deferred:test:packages/cli/tests/show.test.ts", sources: [S9] }
  - { id: A4, statement: "in the ticket-to-qa scenario the ticket's work runs as three event-started workflows, two reviews a minute apart make one round, and amy show tells the story across all three", proof: "deferred:assertion:lifecycle.a_review_round_is_its_own_workflow", sources: [S1, S10, S11, S12] }
  - { id: A5, statement: "a workflow whose [*] edge names no event is discovered exactly as before", proof: "assertion:plan.a_refused_draft_goes_back_to_the_agent", sources: [S4, S13] }
crosses:
  - { mechanism: record-migration, answer: works, proof: "deferred:not specified by the plan; a ticket-to-qa record saved in PR_OPEN..RE_REVIEW before the split must still be read" }
  - { mechanism: calls, answer: n/a, why: "runs share a lineage by key; no workflow calls another" }
  - { mechanism: hooks, answer: n/a, why: "key is a new defineWorkflow field; before, after and interrupt are unchanged" }
  - { mechanism: diagram, answer: works, proof: "deferred:test:packages/workflow-testkit/tests/triggers.test.ts" }
  - { mechanism: engines, answer: works, proof: "deferred:A1; the concurrent engine is the serial engine's Worker" }
  - { mechanism: budget-and-evidence, answer: n/a, why: "an event changes when a look happens, not how an agent run is checked (an event is a reason to look)" }
  - { mechanism: workflow-tooling, answer: works, proof: "deferred:test:packages/workflow-testkit/tests/triggers.test.ts" }
guarantee:
  - { holds: "one run per key per workflow at a time", not_against: "two events for the same key; the second wakes the running one" }
  - { holds: "a run reads its lineage's earlier records only", not_against: "a write to an earlier run's record, which is refused" }
cut:
  - "splitting a mid-work wait into its own workflow: refused; CLARIFYING waiting on a reply stays part of the run that asked (S13)"
exit: "ticket-to-qa scenario: three workflows, not one loop: one builds, opens the PR; one starts per review, settles, pushes; one starts on the merge, hands to QA; two reviews in a minute are one round; amy show tells one story"
---
# A workflow starts on an event

A workflow is one lifecycle for the whole life of the work, so most of its length is polling waits and every review round loops through the same states. A workflow that starts when something happens and ends when it is dealt with fits on a screen.

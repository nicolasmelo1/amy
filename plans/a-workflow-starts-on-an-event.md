---
sources:
  - { id: S1, kind: friction, said: "a workflow is one lifecycle for the whole life of the work; the private workflow has twenty-one states, mostly polling waits, and each review round loops back through the same states" }
  - { id: S2, kind: decision, said: "a workflow may begin on an event and end once dealt with: ticket reaches working status → read → work → open PR → [*]; review submitted → judge → escalate on doubt → fix → push → [*]" }
  - { id: S3, kind: reference, ref: "plans/an-event-is-a-reason-to-look.md", said: "the edge out of [*] may name the starting event, read as on a waiting state's edge, e.g. [*] --> TRIAGE: code-host.review.submitted; polling stays the net under both" }
  - { id: S4, kind: decision, ref: "packages/core/src/diagram.ts", said: "each such event starts one record; a [*] edge naming no event is discovered as today; a workflow may be event-started and discovered as well" }
  - { id: S5, kind: decision, ref: "packages/core/src/define-workflow.ts", said: "defineWorkflow gains key, a function from the event to what the work is about, usually the ticket, which a code-host event finds through the pull request it names" }
  - { id: S6, kind: reference, ref: "plans/the-review-is-remembered-across-rounds.md", said: "runs of one key are one lineage sharing ticket and brief, what earlier review rounds settled, and attempts spent" }
  - { id: S7, kind: decision, said: "a run's id is its key and workflow, e.g. PROJ-1/review#3; observe reads earlier runs' records in its lineage read-only through the store" }
  - { id: S8, kind: decision, said: "one run per key at a time: an event for a key whose run is still going wakes it rather than starting another; two reviews in a minute are one round" }
  - { id: S9, kind: reference, ref: "plans/an-escalation-brings-its-evidence.md", said: "amy show PROJ-1 lists every run of every workflow with that key, in order, with history and evidence; the window draws the same" }
  - { id: S10, kind: decision, said: "ticket-to-qa's review loop, PR_OPEN through HUMAN_FIX and RE_REVIEW, becomes @amykit/workflow-review-round: starts on code-host.review.submitted, keyed by ticket, ends when the round is settled and pushed" }
  - { id: S11, kind: decision, said: "ticket-to-qa ends when the PR is open; merge and QA handoff are a third short workflow started by code-host.pull-request.merged" }
  - { id: S12, kind: decision, said: "the ticket-to-qa scenario drives all three through the installed executable with signed webhooks posted to amy serve on loopback, asserting two reviews a minute apart make one round and amy show tells the whole story; its gate requires both" }
  - { id: S13, kind: decision, said: "a mid-work wait stays a state an event wakes (CLARIFYING waiting on a reply); a workflow starts on an event only when what follows is new work. Both shapes stay valid; docs say which to reach for" }
  - { id: S14, kind: decision, said: "an event whose key throws, or resolves no ticket (a pull request naming none), is dropped with a log line and starts no run. Decided 2026-11-08" }
  - { id: S15, kind: decision, said: "discovery and an event finding the same key make one run: the first to claim the key starts it, and the other wakes it as S8 does. Decided 2026-11-08" }
  - { id: S16, kind: decision, said: "an event for a key whose run has already ended starts a new run, the next round in its lineage. Decided 2026-11-08" }
  - { id: S17, kind: decision, said: "a ticket-to-qa record saved in PR_OPEN through RE_REVIEW before the split is refused by name at load, naming the record and its state; it is not migrated into the review-round workflow. Decided 2026-11-08" }
touches:
  - packages/core/src/diagram.ts
  - packages/core/src/define-workflow.ts
  - packages/core/src/lineage.ts
  - packages/core/tests/lineage.test.ts
  - plugins/serial-engine/src/Worker.ts
  - plugins/serial-engine/tests/triggers.property.test.ts
  - examples/workflow-ticket-to-qa/workflow.mmd
  - examples/workflow-ticket-to-qa/src/machine.ts
  - examples/workflow-ticket-to-qa/src/record.ts
  - examples/workflow-ticket-to-qa/tests/record.test.ts
  - packages/workflow-review-round/package.json
  - packages/workflow-review-round/tsconfig.json
  - packages/workflow-review-round/README.md
  - packages/workflow-review-round/workflow.mmd
  - packages/workflow-review-round/src/index.ts
  - packages/workflow-review-round/src/machine.ts
  - packages/workflow-review-round/tests/walkthrough.test.ts
  - packages/workflow-testkit/src/*.ts
  - packages/workflow-testkit/tests/triggers.test.ts
  - packages/cli/src/index.ts
  - packages/cli/tests/show.test.ts
  - docs/build/write-a-workflow.md
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "an event named on a workflow's [*] edge starts one record keyed by the workflow's key; a second event for the same key while that run is going wakes it instead of starting another", proof: "deferred:property:plugins/serial-engine/tests/triggers.property.test.ts#event_for_a_running_key_starts_another", sources: [S2, S3, S4, S5, S8] }
  - { id: A2, statement: "a run reads the records of earlier runs in its lineage, read-only, and a write to one is refused", proof: "deferred:test:packages/core/tests/lineage.test.ts", sources: [S6, S7] }
  - { id: A3, statement: "amy show <key> lists every run of every workflow with that key, in order, with each one's history and evidence", proof: "deferred:test:packages/cli/tests/show.test.ts", sources: [S9] }
  - { id: A4, statement: "in the ticket-to-qa scenario the ticket's work runs as three event-started workflows, two reviews a minute apart make one round, and amy show tells the story across all three", proof: "deferred:assertion:lifecycle.a_review_round_is_its_own_workflow", sources: [S1, S10, S11, S12] }
  - { id: A5, statement: "a workflow whose [*] edge names no event is discovered exactly as before", proof: "assertion:plan.a_refused_draft_goes_back_to_the_agent", sources: [S4, S13] }
  - { id: A6, statement: "an event whose key throws or resolves no ticket starts no run and leaves a log line naming the event", proof: "deferred:property:plugins/serial-engine/tests/triggers.property.test.ts#an_unkeyed_event_starts_a_run", sources: [S5, S14] }
  - { id: A7, statement: "for any interleaving of discovery and events finding one key, at most one run of that workflow is going for it", proof: "deferred:property:plugins/serial-engine/tests/triggers.property.test.ts#discovery_and_event_start_two_runs", sources: [S4, S8, S15] }
  - { id: A8, statement: "an event for a key whose run has ended starts a new run in the same lineage, not a wake of the ended one", proof: "deferred:test:packages/core/tests/lineage.test.ts", sources: [S7, S16] }
  - { id: A9, statement: "a ticket-to-qa record saved in any of PR_OPEN..RE_REVIEW is refused at load naming the record and its state", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/record.test.ts", sources: [S10, S17] }
crosses:
  - { mechanism: record-migration, answer: refused, by: "a ticket-to-qa record saved in PR_OPEN..RE_REVIEW before the split is refused by name at load, not migrated (S17, A9)" }
  - { mechanism: calls, answer: n/a, why: "runs share a lineage by key; no workflow calls another" }
  - { mechanism: hooks, answer: n/a, why: "key is a new defineWorkflow field; before, after and interrupt are unchanged" }
  - { mechanism: diagram, answer: works, proof: "deferred:test:packages/workflow-testkit/tests/triggers.test.ts" }
  - { mechanism: engines, answer: works, proof: "deferred:A1; the concurrent engine is the serial engine's Worker" }
  - { mechanism: budget-and-evidence, answer: n/a, why: "an event changes when a look happens, not how an agent run is checked (an event is a reason to look)" }
  - { mechanism: workflow-tooling, answer: works, proof: "deferred:test:packages/workflow-testkit/tests/triggers.test.ts" }
guarantee:
  - { holds: "one run per key per workflow at a time", not_against: "two events for the same key; the second wakes the running one" }
  - { holds: "one run per key per workflow at a time, however the key was found", not_against: "a key function that maps two different events of one piece of work to two different keys" }
  - { holds: "an event that resolves no key starts nothing", not_against: "work the key cannot find, which discovery still finds as today" }
  - { holds: "a run reads its lineage's earlier records only", not_against: "a write to an earlier run's record, which is refused" }
cut:
  - "splitting a mid-work wait into its own workflow: refused; CLARIFYING waiting on a reply stays part of the run that asked (S13)"
exit: "ticket-to-qa scenario: three workflows, not one loop: one builds, opens the PR; one starts per review, settles, pushes; one starts on the merge, hands to QA; two reviews in a minute are one round; amy show tells one story"
---
# A workflow starts on an event

A workflow is one lifecycle for the whole life of the work, so most of its length is polling waits and every review round loops through the same states. A workflow that starts when something happens and ends when it is dealt with fits on a screen.

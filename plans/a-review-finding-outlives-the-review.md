---
sources:
  - { id: S1, kind: friction, ref: "issue #61", said: "a review thread has source, location, body and conversation (CodeHost.ts), and the ticket workflow folds only an operational verdict into its record (Ticketing.ts); no corpus puts one reviewer's claims from two works side by side" }
  - { id: S2, kind: reference, ref: "plans/the-review-is-remembered-across-rounds.md", said: "that plan keeps a thread from rework inside one ticket and grows the verdict vocabulary; this one keeps findings after the ticket, across workflows and sources, human truth fields empty" }
  - { id: S3, kind: code, ref: "packages/core/src/runtime.ts", said: "workflows declare terminal states (plugin.ts); the serial engine observes settled, completes the queue item and prunes (Worker.ts); WorkflowRuntime has observe, handlers, apply, but no terminal callback" }
  - { id: S4, kind: decision, said: "Finding is a core contract: stable id, source, source finding id, work id, location, body, time; machine-owned outcomes: code changed after it, answered, resolved, contradicted" }
  - { id: S5, kind: decision, said: "human-owned verdict and evidence are nullable and absent on append; the write port has no method accepting them, so the machine cannot forge adjudication through a cast or an action" }
  - { id: S6, kind: decision, said: "sources are named FindingSource contributions (review adapters, self-review steps, other plugins) to one collection; a workflow declares source names in its own config; no source name enters core; an install declaring none keeps today's mount" }
  - { id: S7, kind: code, ref: "packages/core/src/plugin.ts", said: "readiness validates every declared source name after all plugins mount, the live-contribution pattern used elsewhere" }
  - { id: S8, kind: decision, said: "an optional generic completion hook on WorkflowRuntime: after a settled item is durably completed the engine enqueues one idempotent collection job and returns without waiting for remote reads" }
  - { id: S9, kind: decision, said: "the collector processes the durable job separately: reads every declared source, derives outcomes, appends, records source failures without reopening or failing work; retries dedupe by source + source finding id + work id" }
  - { id: S10, kind: decision, ref: "plugins/file-store/src/plugin.ts", said: "file-store grows, beside record and brief stores, one profile-scoped corpus and collection queue, mounted unconditionally; reads return one snapshot, append is atomic, machine updates touch only machine-owned fields" }
  - { id: S11, kind: code, ref: "packages/core/src/actions.ts", said: "human adjudication stays an explicit file/API boundary outside every core action; no CORE_ACTIONS entry writes verdict or evidence" }
  - { id: S12, kind: decision, said: "grouping is deterministic on source, normalised repository path and symbol/location; opposing claims in a group are both marked contradicted: true and linked, verdict and evidence empty" }
  - { id: S13, kind: decision, said: "a source supplying no symbol: the collector does not invent one from prose; those findings stay ungrouped" }
  - { id: S14, kind: decision, ref: "packages/cli/src/index.ts", said: "amy findings and amy findings --json render one corpus snapshot, like amy brief and amy status; human form lists unadjudicated and contradictory first; JSON keeps all provenance and ownership fields" }
  - { id: S15, kind: decision, said: "ticket-to-qa, extended, proves installed completion and review collection; a narrow workflow fixture proves the no-source compatibility path" }
  - { id: S16, kind: decision, said: "gate assertions: findings.two_declared_sources_join_one_corpus, self_review_is_a_source_not_a_special_case, collection_failure_does_not_reopen_finished_work, a_retry_does_not_duplicate_a_finding, opposing_claims_are_flagged_without_a_verdict, no_sources_keeps_the_existing_terminal_path" }
touches:
  - packages/core/src/runtime.ts
  - packages/core/src/plugin.ts
  - packages/core/src/mount.ts
  - packages/core/src/index.ts
  - packages/core/tests/findings.test.ts
  - packages/core/tests/mount.test.ts
  - plugins/serial-engine/src/Worker.ts
  - plugins/file-store/src/**
  - packages/workflow-ticket-to-qa/src/plugin.ts
  - packages/cli/src/index.ts
  - packages/cli/tests/findings.test.ts
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "a workflow declaring two mounted finding sources collects both into one corpus with source, location, body, work id and time intact", proof: "assertion:findings.two_declared_sources_join_one_corpus", sources: [S2, S4, S6, S15, S16] }
  - { id: A2, statement: "a workflow's self-review contribution is collected through the same source contract, without a core action or source name dedicated to it", proof: "assertion:findings.self_review_is_a_source_not_a_special_case", sources: [S6, S16] }
  - { id: A3, statement: "the machine-facing store and action surfaces cannot set verdict or evidence, and a machine append persists both as empty", proof: "test:packages/core/tests/findings.test.ts", sources: [S1, S5, S10, S11] }
  - { id: A4, statement: "a source failure after work settles neither delays, fails nor reopens the work; retrying the durable job does not duplicate an existing finding", proof: "assertion:findings.collection_failure_does_not_reopen_finished_work", sources: [S3, S8, S9, S16] }
  - { id: A5, statement: "opposing claims with the same source, path and symbol are linked and flagged contradictory while both human verdicts remain empty", proof: "assertion:findings.opposing_claims_are_flagged_without_a_verdict", sources: [S12, S13, S16] }
  - { id: A6, statement: "an install declaring no finding sources follows the existing terminal path and writes no corpus or collection job", proof: "assertion:findings.no_sources_keeps_the_existing_terminal_path", sources: [S8, S15, S16] }
  - { id: A7, statement: "amy findings and amy findings --json render one snapshot and preserve every provenance and ownership field", proof: "test:packages/cli/tests/findings.test.ts", sources: [S14] }
  - { id: A8, statement: "an unknown declared source is refused by name at boot, after all source plugins have had a chance to contribute", proof: "test:packages/core/tests/mount.test.ts", sources: [S7] }
crosses:
  - { mechanism: attempts-and-waits, answer: n/a, why: "the completion hook runs after a settled item is completed; it charges and gives back no attempt" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "test:packages/core/tests/mount.test.ts" }
  - { mechanism: engines, answer: works, proof: "deferred:A4, A6; the concurrent engine is the serial engine's Worker, so the hook lives once in Worker.ts" }
  - { mechanism: budget-and-evidence, answer: n/a, why: "collection reads finding sources and runs no agent, so nothing passes the budget check" }
  - { mechanism: queue-and-store, answer: works, proof: "deferred:A4; the corpus outlives record pruning and the collection job is durable and idempotent" }
guarantee:
  - { holds: "no machine surface fills a finding's verdict or evidence", not_against: "a human editing through the explicit file/API boundary" }
  - { holds: "collection never holds completion open, reopens or fails finished work", not_against: "a source that fails to read; collection records the failure" }
failures:
  - { step: collection, when: "a declared source fails to read", goes_to: "the failure is recorded on the job; the settled work stays completed" }
  - { step: collection retry, when: "a finding already in the corpus", goes_to: "deduplicated by source + source finding id + work id" }
cut:
  - "folding the corpus into TicketRecord.judged: refused; one workflow's state would be the storage contract and retiring work would delete the evidence"
  - "teaching the engine review vocabulary to attach collection: refused in favour of a generic completion contribution"
  - "inventing a symbol from prose for grouping: refused (S13)"
exit: "review and self-review findings survive finished work in one queryable corpus with their mechanical outcomes, repeated collection is idempotent, contradictions are visible, no machine surface can fill the human verdict or evidence that would turn an anecdote into a rule"
---
# A review finding outlives the review

The machine throws review findings away when the work ends: a thread's claim survives only as one workflow's operational verdict. Nothing can put the same reviewer's claims from two pieces of work beside each other.

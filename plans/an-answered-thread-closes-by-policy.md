---
sources:
  - { id: S1, kind: code, ref: "packages/workflow-ticket-to-qa/src/machine.ts", said: "every unresolved automated thread whose recorded verdict is fixed becomes a resolve-review-thread action, literally, in the machine" }
  - { id: S2, kind: reference, ref: "docs/design/the-threads-close-when-they-are-answered.md", said: "human threads stay open as workflow policy — but that policy is prose and a branch, not configuration" }
  - { id: S3, kind: ticket, ref: "issue #54", said: "the code-host port exposes the mechanism, the workflow chooses the policy, neither in stone; the default may keep the delivered decision, the operator sets and alters it, the machine does exactly what config says" }
  - { id: S4, kind: decision, said: "policy.answeredThreadResolution: { automated, human }, each close or leave-open; defaults automated: close, human: leave-open, preserving the machine for an unchanged install" }
  - { id: S5, kind: decision, said: "the two axes are independent: both closed, both open and either mixed configuration are valid" }
  - { id: S6, kind: decision, said: "close applies only after an affirmative answer — fixed today, answered when the planned review triage lands; disagreed, deferred, wont-fix, a missing verdict or an incomplete run never close" }
  - { id: S7, kind: decision, said: "the setting belongs to @amykit/workflow-ticket-to-qa: GitHub implements resolveReviewThread without deciding whose objection amy settles, Linear never sees it; the pure machine gets the parsed policy and emits or omits the action" }
  - { id: S8, kind: code, ref: "packages/workflow-ticket-to-qa/src/plugin.ts", said: "configSchema.policy says only record, and runtimeFor spreads it into DEFAULT_POLICY with a type assertion" }
  - { id: S9, kind: decision, said: "a local parsePolicy is the one path from plugin config to Policy: validates every known scalar and both answeredThreadResolution keys and values, fills omissions from DEFAULT_POLICY, refuses unknown nested keys at boot with full path" }
  - { id: S10, kind: decision, said: "the decision does not enter the record: it keeps what the agent answered, and the current policy decides on each look, so an edit and restart needs no record migration" }
  - { id: S11, kind: decision, said: "a thread already closed is not reopened when policy turns to leave-open; unresolveReviewThread stays an explicit workflow action, never a config side effect" }
  - { id: S12, kind: decision, said: "one helper derives closeable threads from reviewer class, latest verdict and current policy, for automated and human states; no second hard-coded humans-never branch; future verdicts go through one exhaustive switch" }
  - { id: S13, kind: decision, said: "gate ticket-to-qa extended: the stand-in forge starts with one automated and one human unresolved thread, records every resolve mutation, never closes a thread because code changed; runs every combination, then edit-and-restart" }
  - { id: S14, kind: decision, said: "assertions read the forge's raw thread state and mutation log; a plan or record saying resolved is no proof the remote conversation closed" }
  - { id: S15, kind: decision, said: "changed-policy case: judge under leave-open, remount with close, exactly one mutation on the next eligible look; the inverse proves no already-closed thread reopens" }
touches:
  - packages/workflow-ticket-to-qa/src/machine.ts
  - packages/workflow-ticket-to-qa/src/observation.ts
  - packages/workflow-ticket-to-qa/src/plugin.ts
  - packages/workflow-ticket-to-qa/tests/machine.test.ts
  - .software-factory/evidence/ticket-to-qa-scenario.sh
  - .software-factory/policy.yaml
untouched:
  - plugins/github/src/**
  - plugins/linear/src/**
  - packages/core/src/config-schema.ts
criteria:
  - { id: A1, statement: "the unchanged default closes answered automated threads and leaves answered human threads open", proof: "assertion:resolution.the_default_closes_only_the_answered_automated_thread", sources: [S1, S2, S4, S13, S14] }
  - { id: A2, statement: "every combination of automated and human close or leave-open is accepted, and each reviewer class follows its own setting independently", proof: "assertion:resolution.each_reviewer_class_follows_its_own_setting", sources: [S3, S5, S7] }
  - { id: A3, statement: "when both reviewer classes are configured to close, each answered thread receives exactly one remote mutation", proof: "assertion:resolution.both_close_closes_each_answered_thread_once", sources: [S5, S14] }
  - { id: A4, statement: "a configuration leaving both classes open sends no resolve mutation even though both answers are recorded", proof: "assertion:resolution.leave_open_closes_no_answered_thread", sources: [S5, S14] }
  - { id: A5, statement: "a disagreement, deferral, wont-fix, missing verdict or incomplete run never closes a thread under either policy", proof: "assertion:resolution.a_non_answer_never_closes_under_any_policy", sources: [S6] }
  - { id: A6, statement: "editing the policy and remounting changes the next decision without a record migration and never reopens already-settled remote history", proof: "assertion:resolution.changing_policy_changes_the_next_move_not_the_record", sources: [S10, S11, S15] }
  - { id: A7, statement: "unknown keys and values in answeredThreadResolution are refused at boot with the full config path, before any code-host mutation", proof: "assertion:resolution.invalid_policy_is_refused_before_the_first_mutation", sources: [S8, S9] }
  - { id: A8, statement: "the machine has one exhaustive eligibility rule for both reviewer classes, with no hard-coded automated or human exception beside it", proof: "test:packages/workflow-ticket-to-qa/tests/machine.test.ts", sources: [S12] }
crosses:
  - { mechanism: record-migration, answer: works, proof: "deferred:A6 — the record shape does not change; policy is read on each look" }
guarantee:
  - { holds: "the machine closes exactly the threads the current policy names, once each", not_against: "threads already closed before a policy change: they are never reopened" }
failures:
  - { step: boot, when: "answeredThreadResolution has an unknown key or value", goes_to: "refused with the full config path, before any code-host mutation" }
cut:
  - "growing the five-type core schema language for one workflow's nested vocabulary"
  - "reopening already-closed threads on a policy change: future policy is not permission to rewrite remote history"
  - "unresolving as a config side effect"
exit: "an operator independently chooses whether answered automated and human threads close, alters it for the next mounted run, and sees exactly the configured mutations — no more, no fewer — proven against the stand-in forge, not the machine's record"
---
# An answered thread closes by policy

Whether amy closes an answered review thread is hard-coded — automated closed,
human left open — so an install can neither leave bot threads to their author
nor let the machine settle human threads it has answered.

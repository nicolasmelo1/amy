---
base: 470b87e6db3e9c2efcce7b93f42ae566092978c0
sources:
  - { id: S1, kind: reference, ref: "plans/code-is-written-once-and-reached.md", said: "the duplication gate combines detector output with scripts/duplication-baseline.json, and the baseline is a ratchet rather than a place to accept new debt" }
  - { id: S2, kind: decision, said: "the duplication baseline may only shrink from the branch base; a newly frozen key fails even when it has a review date" }
touches:
  - packages/cli/src/duplication.ts
  - packages/cli/tests/written-once.test.ts
criteria:
  - { id: A1, statement: "a key absent from the base baseline fails when the current baseline adds it", proof: "deferred:test:packages/cli/tests/written-once.test.ts", sources: [S1, S2] }
  - { id: A2, statement: "a key frozen at the base continues to pass when the detector still finds it", proof: "deferred:test:packages/cli/tests/written-once.test.ts", sources: [S2] }
crosses:
  - { mechanism: mount-and-capabilities, answer: n/a, why: "the detector ratchet reads static reports only; it changes no mounted capability or workflow action" }
guarantee:
  - { holds: "a current baseline cannot hide a finding absent from its base", not_against: "a base finding that no detector reports, which the ratchet removes" }
cut:
  - "freezing a new finding just to pass a changed branch"
exit: "the duplication gate accepts only the base findings that remain and rejects every newly frozen key"
---
# The ratchet cannot grow

The duplication gate accepts the current baseline alone, so a change can add
debt and label it reviewed in the same commit. The base baseline must remain
the ceiling: only its still-present entries can pass.

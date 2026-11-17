---
base: 6bb1b62ccc7684af754fab32a8ec2e0b0603e10f
sources:
  - { id: S1, kind: reference, ref: "https://github.com/nicolasmelo1/amy/pull/230", said: "the duplication gate freezes findings that already exist, but new code must not make the baseline a way to accept debt" }
  - { id: S2, kind: decision, said: "the duplication check reads the baseline at the branch base and refuses a current key absent from it; its remedy tells the reader to remove the finding instead of freezing it" }
touches:
  - scripts/check-duplication.ts
  - .software-factory/rules/duplicated-code-is-detected.yaml
  - packages/cli/src/duplication.ts
  - packages/cli/tests/written-once.test.ts
  - registry/cli.json
  - docs/rules.md
  - docs/development/the-factory.md
criteria:
  - { id: A1, statement: "the duplication command rejects a finding newly frozen by the current branch and accepts a base finding that is still reported", proof: "deferred:test:packages/cli/tests/written-once.test.ts", sources: [S1, S2] }
  - { id: A2, statement: "the detector rule and failure output tell the reader to remove a new finding rather than freeze it", proof: "deferred:test:packages/cli/tests/written-once.test.ts", sources: [S1, S2] }
crosses:
  - { mechanism: mount-and-capabilities, answer: n/a, why: "the static quality gate reads Git and detector reports only; boot bindings and workflow actions are unchanged" }
guarantee:
  - { holds: "a branch cannot make a new duplication finding pass by placing its key in the current baseline", not_against: "a finding already recorded at the branch base, which stays frozen until removed" }
cut:
  - "rewriting the baseline format or deleting existing frozen debt"
exit: "npm run check:duplication rejects a newly frozen finding and reports that it must be removed"
---
# The ratchet reads its base

The current baseline is part of the branch under review, so it cannot decide
what the branch is allowed to add. The gate reads the base baseline as the
ceiling and treats a current-only key as a new finding.

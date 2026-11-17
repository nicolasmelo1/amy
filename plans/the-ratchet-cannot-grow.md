---
base: 6bb1b62ccc7684af754fab32a8ec2e0b0603e10f
sources:
  - { id: S1, kind: reference, ref: "plans/code-is-written-once-and-reached.md", said: "the duplication gate combines detector output with scripts/duplication-baseline.json, and the baseline is a ratchet rather than a place to accept new debt" }
  - { id: S2, kind: decision, said: "the duplication baseline may only shrink from the branch base; a newly frozen key fails even when it has a review date" }
  - { id: S3, kind: decision, said: "a test is not a production caller: an export a test helper or a script test reaches is dead code, and a test file is not a file the detector reports as unused" }
touches:
  - packages/cli/src/duplication.ts
  - scripts/check-duplication.ts
  - knip.json
  - .software-factory/rules/duplicated-code-is-detected.yaml
  - packages/cli/tests/written-once.test.ts
criteria:
  - { id: A1, statement: "an export only a helper under tests/ reaches, or only a test under scripts/ reaches, is reported as unused", proof: "deferred:test:packages/cli/tests/written-once.test.ts", sources: [S1, S3] }
  - { id: A2, statement: "a key absent from the base baseline fails when the current baseline adds it, and a key the base froze keeps passing", proof: "deferred:test:packages/cli/tests/written-once.test.ts", sources: [S1, S2] }
  - { id: A3, statement: "neither the gate's output nor the rule's fix text tells a reader to take a new finding into the baseline", proof: "deferred:test:packages/cli/tests/written-once.test.ts", sources: [S2] }
  - { id: A4, statement: "--seed refuses to run over a baseline that exists and leaves the file byte-identical", proof: "deferred:test:packages/cli/tests/written-once.test.ts", sources: [S2] }
crosses:
  - { mechanism: mount-and-capabilities, answer: n/a, why: "the detector ratchet reads static reports only; it changes no mounted capability or workflow action" }
guarantee:
  - { holds: "a change cannot take a finding into the baseline that the merge base did not already carry, and code reached only by a test is reported", not_against: "a base finding that no detector reports, which the ratchet removes" }
failures:
  - { step: gate, when: "the base baseline is read from the working tree instead of the merge base", goes_to: "a key added to the file in the same change passes, and the test that freezes it fails" }
cut:
  - "freezing a new finding just to pass a changed branch"
exit: "the duplication gate accepts only the base findings that remain, rejects every newly frozen key, and reports code no test can keep alive"
---
# The ratchet cannot grow

The duplication gate accepts the current baseline alone, so a change can add
debt and label it reviewed in the same commit. The base baseline must remain
the ceiling: only its still-present entries can pass. The detector's config
counted a test as a caller too, so an export a helper reached stayed live; a
test is not a caller, and the report says so now.

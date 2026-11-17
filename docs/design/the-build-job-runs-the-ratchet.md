---
base: c61e58cb592cee616bea5d0e85304ffa01f9f92b
sources:
  - { id: S1, kind: code, ref: ".github/workflows/software-factory.yml", symbol: "npm run knip", said: "the build job runs the detector directly as its own step, so it exits 1 on every finding a ratchet has already frozen; the gate step applies the ratchet, so the two jobs disagree about the same tree" }
touches:
  - .github/workflows/software-factory.yml
  - packages/cli/tests/duplication.test.ts
criteria:
  - { id: A1, statement: "the build job runs the duplication step, so CI applies the same ratchet the gate does instead of failing on what is already frozen", proof: "test:packages/cli/tests/duplication.test.ts", done: true, sources: [S1] }
crosses:
  - { mechanism: workflow-tooling, answer: n/a, why: "the step that runs the detectors is CI's; what `amy workflow check` draws and walks is unchanged" }
guarantee:
  - { holds: "a new unused export or copied block fails CI once, in the job that runs the gate, and the build job does not fail on frozen findings", not_against: "the two jobs staying separate" }
failures:
  - { step: gate, when: "the step is renamed in the workflow and the test still names the old name", goes_to: "the test that reads the workflow fails, naming the step it expected" }
cut:
  - "folding the frozen copies into helpers: that is the ratchet's own work, not this step's"
exit: "the build job's duplication step is green on a tree whose only findings are the frozen ones"
---
# The build job runs the ratchet

The build job runs `knip` as its own step, so a tree that is green through the
gate is red in that job: the gate applies the ratchet and the step does not.
Both jobs run the same step, and a test reads the workflow to say so. The step
had named the detector since the detector was wired; what was missing is the
ratchet, which is the part that decides what a finding means.

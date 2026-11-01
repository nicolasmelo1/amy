---
sources:
  - { id: S1, kind: reference, ref: "plans/a-decision-is-asked-of-a-port.md", said: "every rung of a decider ladder has an accept, and nothing says what the number should be; every verdict is on the record" }
  - { id: S2, kind: decision, said: "a 0.9 from an encoder is not one from a 9B decoder, nor from either on another question; as of October 2026 no named decision model publishes calibration, and vendors say set thresholds from your own labelled examples" }
  - { id: S3, kind: decision, said: "each question names, beside its answers and fallback, the error it tolerates on the answer expensive to get wrong: decision for reply-kind. The workflow knows its mistakes' cost; the operator should not have to" }
  - { id: S4, kind: decision, said: "every recorded verdict is an example; a person marking a reply differently from the ladder, or saying 'that was a question' in the thread, is its label" }
  - { id: S5, kind: decision, said: "a workflow may ship hand-labelled seed examples, written under L6.FIXTURES_NAME_NOBODY_REAL, so a new install can measure before it has a history" }
  - { id: S6, kind: decision, said: "amy decide measure <question> runs every configured decider over the labelled examples and prints accuracy and coverage (how often it would decide at all) at each threshold" }
  - { id: S7, kind: decision, said: "it writes the lowest accept keeping the expensive error under the tolerance, keyed by the decider and its weights' digest, or the model version a hosted one reports" }
  - { id: S8, kind: decision, said: "a rung with no measured threshold, or one measured against other weights, is asked and recorded but never decides: the next rung or fallback does. New models gather examples; new weights leave deciding until remeasured" }
  - { id: S9, kind: decision, said: "a hand-written accept stays possible and amy doctor reports it unmeasured" }
touches:
  - packages/agent-kit/src/deciders.ts
  - packages/agent-kit/tests/deciders.test.ts
  - packages/workflow-ticket-to-qa/src/discussion.ts
  - packages/workflow-ticket-to-qa/src/runtime.ts
  - packages/cli/src/decide.ts
  - packages/cli/src/index.ts
  - packages/cli/src/doctor.ts
  - packages/cli/tests/decide.test.ts
  - packages/cli/tests/decider.test.ts
criteria:
  - { id: A1, statement: "a rung with no measured threshold records its verdict and never decides", proof: "deferred:test:packages/agent-kit/tests/deciders.test.ts", sources: [S1, S2, S8] }
  - { id: A2, statement: "amy decide measure over labelled examples writes the lowest threshold keeping the expensive error under the question's tolerance, and prints accuracy and coverage for every threshold it tried", proof: "deferred:test:packages/cli/tests/decide.test.ts", sources: [S3, S5, S6, S7] }
  - { id: A3, statement: "a person's mark that disagrees with a recorded verdict becomes a labelled example", proof: "deferred:walkthrough in the testkit", sources: [S4] }
  - { id: A4, statement: "pulling weights with a different digest returns the rung to shadow, and amy doctor names it", proof: "deferred:test:packages/cli/tests/decider.test.ts", sources: [S7, S8, S9] }
crosses:
  - { mechanism: attempts-and-waits, answer: n/a, why: "a decider is asked while the observation is built, not as an agent run; no attempt is charged" }
  - { mechanism: agent-replies, answer: n/a, why: "measuring reads typed verdicts and labels, never an agent's prose reply" }
cut:
  - "refusing a hand-written accept outright: refused, it would leave somebody with no examples yet with no ladder at all"
exit: "a decider whose threshold was never measured only records what it would have said; after amy decide measure runs on the examples it decides, and new weights for the same model return it to shadow until measured again"
---
# A threshold is measured, not guessed

A threshold typed by hand is a guess that reads as if somebody had measured it, and nobody can name a good number in general.

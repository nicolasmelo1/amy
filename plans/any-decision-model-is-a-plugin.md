---
sources:
  - { id: S1, kind: decision, said: "hard questions want a bigger model behind the local one, some machines lack a GPU for a 9B decoder, and hosted models are most of the category (October 2026)" }
  - { id: S2, kind: reference, said: "hosted: OpenAI's Decisions API (predicate, choice and score questions); TypeSafe's Jev; Cloudflare's Clef and Clef-flash on Workers AI, Jev-compatible" }
  - { id: S3, kind: reference, ref: "plans/a-decision-is-asked-of-a-port.md", said: "made the port's shape the one these share, so each is an adapter and no new seam is needed" }
  - { id: S4, kind: reference, ref: "docs/design/no-port-method-ships-unproven.md", said: "a decider conformance suite in the testkit, which every Decider plugin runs, follows it" }
  - { id: S5, kind: decision, said: "a decider answers only from the question's set, with probabilities summing to one when it returns any" }
  - { id: S6, kind: decision, said: "hosted adapters run the suite against recorded responses, so it runs offline in CI" }
  - { id: S7, kind: decision, said: "@amykit/plugin-decider-openai for the Decisions API; its public beta refuses individual questions, and those refusals map to unsure" }
  - { id: S8, kind: decision, said: "@amykit/plugin-decider-jev for any Jev-compatible endpoint: pointed at TypeSafe it is Jev, at Workers AI's compatible endpoint it is Clef; one protocol, one plugin" }
  - { id: S9, kind: decision, said: "@amykit/plugin-decider-harness asks the installed harness constrained to the set; its confidence is self-reported, not a probability, measured like any rung; it lets a ladder end on the strong model, not the fallback" }
  - { id: S10, kind: reference, ref: "plans/a-threshold-is-measured-not-guessed.md", said: "comes first, because the harness decider's self-reported confidence must be measured" }
  - { id: S11, kind: decision, said: "a question says whether its context may leave the machine; reply-kind reads somebody's message, so it is local, and a ladder with a hosted rung on it is refused at boot naming both" }
  - { id: S12, kind: decision, said: "an operator can lift local for one question in config.yaml; the workflow cannot lift it on the operator's behalf" }
  - { id: S13, kind: decision, said: "a hosted verdict carries the provider-reported cost, counted by the budget ledger like an agent run; a plugin unable to report cost declares it, like pricesItsOwnRuns, so a money ceiling is never silently inert" }
touches:
  - packages/workflow-testkit/src/decider-conformance.ts
  - packages/workflow-testkit/tests/decider-conformance.test.ts
  - plugins/decider-openai/**
  - plugins/decider-jev/**
  - plugins/decider-harness/**
  - packages/agent-kit/src/deciders.ts
  - packages/agent-kit/tests/deciders.test.ts
  - packages/workflow-ticket-to-qa/src/discussion.ts
  - packages/core/src/budget.ts
  - packages/cli/src/config.ts
criteria:
  - { id: A1, statement: "every shipped decider plugin passes the conformance suite, hosted ones against recorded responses", proof: "deferred:test:packages/workflow-testkit/tests/decider-conformance.test.ts", sources: [S1, S3, S4, S5, S6, S9, S10] }
  - { id: A2, statement: "a refusal from the Decisions API is unsure and the next rung is asked", proof: "deferred:test:plugins/decider-openai/tests/decider.test.ts", sources: [S2, S7] }
  - { id: A3, statement: "the same Jev-compatible plugin answers from recorded TypeSafe and Workers AI responses", proof: "deferred:test:plugins/decider-jev/tests/decider.test.ts", sources: [S2, S8] }
  - { id: A4, statement: "a hosted rung on a question declared local is refused at boot naming both, and accepted when the operator lifts it for that question", proof: "deferred:test:packages/agent-kit/tests/deciders.test.ts", sources: [S11, S12] }
  - { id: A5, statement: "a hosted verdict's cost reaches the budget ledger", proof: "deferred:test:packages/agent-kit/tests/deciders.test.ts", sources: [S13] }
crosses:
  - { mechanism: budget-and-evidence, answer: works, proof: "deferred:A5" }
  - { mechanism: agent-replies, answer: works, proof: "deferred:A1 — the harness decider's reply is read as an answer from the set" }
  - { mechanism: attempts-and-waits, answer: n/a, why: "a decider answers a question; the plan charges no attempt and adds no wait" }
  - { mechanism: workflow-tooling, answer: n/a, why: "the testkit gains a conformance suite; how it walks states and edges is unchanged" }
  - { mechanism: config, answer: works, proof: "deferred:A4" }
guarantee:
  - { holds: "a question declared local never reaches a hosted rung", not_against: "the operator lifting it for that one question in config.yaml" }
failures:
  - { step: "decider (conformance suite)", when: "a question is refused", goes_to: "unsure; the next rung is asked" }
  - { step: "decider (conformance suite)", when: "timeout, authentication or network error", goes_to: unreachable }
  - { step: "decider (conformance suite)", when: "a question exceeds its declared limits", goes_to: "refused, not truncated" }
  - { step: boot, when: "a hosted rung sits on a local question", goes_to: "refused naming both" }
cut:
  - "a new seam: every hosted model is an adapter of the existing port"
  - "a workflow lifting local on the operator's behalf"
exit: "one question is answered by a local model, by Clef on Workers AI and by OpenAI's Decisions API, changing only config.yaml; all pass the same conformance suite, and a local question is refused a hosted rung at boot by name"
---
# Any decision model is a plugin

A local model is the first rung, not the only one; hosted decision models bring
two things a model on the machine never did: whether every adapter means the
same by a verdict, and which text may leave the machine.

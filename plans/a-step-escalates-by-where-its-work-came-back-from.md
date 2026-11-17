---
base: 91f23a8225bd6c3919f74b40ad88cb298a3524fa
sources:
  - { id: S1, kind: code, ref: "plugins/claude/src/envelope.ts", symbol: "classify", said: "a run is failed only when the envelope says is_error or the CLI exits non-zero; an answer that is wrong but well formed is completed, so the ladder never climbs on it" }
  - { id: S2, kind: code, ref: "packages/core/src/ports/Harness.ts", symbol: "AskContext", said: "verify(reply) may turn a completed run to failed while a rung is left; only implementStep passes one (no file changed), so triage, address-threads, self-review and chat climb on a crash and on nothing else" }
  - { id: S3, kind: code, ref: "packages/agent-kit/src/steps.ts", symbol: "judgeStep", said: "an unreadable JSON answer throws in extractJson after the relay returned, so the stronger rung is never asked" }
  - { id: S4, kind: code, ref: "packages/agent-kit/src/handoff.ts", symbol: "handoffNote", said: "the next rung is told the previous one 'did not succeed', never why" }
  - { id: S5, kind: code, ref: "packages/agent-kit/src/HarnessRelay.ts", symbol: "climb", said: "every ask starts at the step's first rung; the relay has no way to begin higher" }
  - { id: S6, kind: code, ref: "examples/workflow-ticket-to-qa/src/machine.ts", symbol: "attemptsIn", said: "rounds are counted per state (IMPLEMENTING, verdict) against policy.maxImplementAttempts and policy.maxGateAttempts; nothing says who sent the work back or how much it found" }
  - { id: S7, kind: code, ref: "packages/core/src/ports/Gate.ts", symbol: "Gate", said: "a gate answers ok and its output; how many checks were red is not said" }
  - { id: S8, kind: code, ref: "packages/core/src/diagram.ts", symbol: "DrawnTransition", said: "an edge label is prose amy does not interpret; classes (waiting, attention, anywhere, returns, call) are what amy reads" }
  - { id: S9, kind: code, ref: "packages/core/src/config-schema.ts", symbol: "ConfigOf", said: "dotted schema keys type the workflow's config and validateConfig refuses missing, mistyped and unknown keys; amy doctor runs it. A value that must name another setting's key has no type" }
  - { id: S10, kind: decision, said: "each agent step may declare its own verify in code; the core gives a default and the field is optional for whoever builds the workflow. Decided 2026-11-17" }
  - { id: S11, kind: decision, said: "two mechanisms, not one: verify judges a reply while the relay can still climb; a round that comes back later (red gate, changes asked, review threads) is decide()'s, keyed by where the work came back from. Decided 2026-11-17" }
  - { id: S12, kind: decision, said: "no origin is special: every state that sends work back says how many findings it brought, and every origin is configured the same way: rounds by default, another level from a number of findings on. Decided 2026-11-17" }
  - { id: S13, kind: decision, said: "no number in workflow code: config.yaml holds a named scale (patient 3 > normal 2 > immediate 1) and every threshold; code picks a name. Each is required with no default; amy doctor names any divergence. Decided 2026-11-17" }
  - { id: S14, kind: decision, said: "an escalation is permanent per piece of work and per origin, and climbs one rung each time, never to the top. Decided 2026-11-17" }
  - { id: S15, kind: decision, said: "breaking change: no legacy path, no deprecated setting kept; amy is its only user. Decided 2026-11-17" }
  - { id: S16, kind: decision, said: "when GATE and SELF_REVIEW both send work back through one join, each counts a round toward its own origin and the stricter level applies. Decided 2026-11-17" }
  - { id: S17, kind: decision, said: "an origin whose rounds run out on the ladder's top rung advances to ESCALATED; policy.maxImplementAttempts and policy.maxGateAttempts are removed. Decided 2026-11-17" }
  - { id: S18, kind: decision, said: "the diagram marks an agent state that declares a verify with class verified, and a state that sends work back with class sendsBack; the workflow's declared origins must equal the sendsBack states, refused at mount. Decided 2026-11-17" }
touches:
  - packages/core/src/ports/Harness.ts
  - packages/core/src/ports/Agent.ts
  - packages/core/src/ports/Gate.ts
  - packages/core/src/escalation.ts
  - packages/core/src/config-schema.ts
  - packages/core/src/diagram.ts
  - packages/core/src/work.ts
  - packages/core/src/define-workflow.ts
  - packages/core/src/index.ts
  - packages/core/tests/escalation.test.ts
  - packages/core/tests/escalation.property.test.ts
  - packages/core/tests/config-schema.test.ts
  - packages/core/tests/config-schema.types.test.ts
  - packages/core/tests/diagram.test.ts
  - packages/core/tests/define-workflow.test.ts
  - packages/agent-kit/src/HarnessRelay.ts
  - packages/agent-kit/src/handoff.ts
  - packages/agent-kit/src/steps.ts
  - packages/agent-kit/tests/HarnessRelay.test.ts
  - packages/agent-kit/tests/steps.test.ts
  - plugins/command-gate/src/CommandGate.ts
  - examples/workflow-ticket-to-qa/workflow.mmd
  - examples/workflow-ticket-to-qa/src/machine.ts
  - examples/workflow-ticket-to-qa/src/observation.ts
  - examples/workflow-ticket-to-qa/src/plugin.ts
  - examples/workflow-ticket-to-qa/src/actions.ts
  - examples/workflow-ticket-to-qa/src/lanes.ts
  - examples/workflow-ticket-to-qa/tests/escalating.test.ts
  - examples/workflow-ticket-to-qa/tests/machine.test.ts
  - examples/workflow-ticket-to-qa/tests/self-review.test.ts
  - packages/cli/src/doctor.ts
  - packages/cli/src/config-template.ts
  - packages/cli/tests/doctor.test.ts
  - docs/concepts/workflows.md
  - docs/concepts/harnesses.md
  - docs/reference/configuration.md
  - .software-factory/policy.yaml
  - .software-factory/evidence/plugin-agent-relay/probe.ts
criteria:
  - { id: A1, statement: "a step's verify that answers escalate turns a completed run to failed with its reason, the relay asks the next rung, and the handoff note carries that reason instead of 'did not succeed'", proof: "deferred:test:packages/agent-kit/tests/HarnessRelay.test.ts", sources: [S2, S4, S10] }
  - { id: A2, statement: "with no verify declared, judgeStep escalates an answer with no readable JSON object and implementStep escalates a run that changed no file; every other step passes what completed", proof: "deferred:test:packages/agent-kit/tests/steps.test.ts", sources: [S3, S10] }
  - { id: A3, statement: "an ask that names a starting rung begins there, and rate-limited, failed and abandoned move from it exactly as from the first", proof: "deferred:test:packages/agent-kit/tests/HarnessRelay.test.ts", sources: [S5] }
  - { id: A4, statement: "a gate answers how many checks were red, and every sendsBack state's outcome carries a findings count", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/escalating.test.ts", sources: [S7, S12] }
  - { id: A5, statement: "for any origin, findings and rounds: below the origin's findings threshold its default level applies, at or above it its beyond level; once the rounds reach the level's number the next round starts one rung higher, and never lower afterwards", proof: "deferred:property:packages/core/tests/escalation.property.test.ts#one_rung_and_permanent", sources: [S12, S14] }
  - { id: A6, statement: "rounds are counted per piece of work and per origin: rounds sent back by COPILOT_WAIT never count toward GATE's", proof: "deferred:test:packages/core/tests/escalation.test.ts", sources: [S6, S11] }
  - { id: A7, statement: "when two lanes send work back through one join, each counts a round toward its own origin and the level that escalates sooner applies", proof: "deferred:test:packages/core/tests/escalation.test.ts", sources: [S16] }
  - { id: A8, statement: "an origin whose rounds run out on the top rung advances to ESCALATED, and neither policy.maxImplementAttempts nor policy.maxGateAttempts is accepted by the schema", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/machine.test.ts", sources: [S15, S17] }
  - { id: A9, statement: "a oneOf setting is typed as the union of the named group's keys, and a value outside them is refused naming the setting and the names it accepts", proof: "deferred:test:packages/core/tests/config-schema.test.ts", sources: [S9, S13] }
  - { id: A10, statement: "every scale value and threshold the workflow names is required with no default; a config missing one, or carrying one the workflow does not name, is red in amy doctor naming the key", proof: "deferred:test:packages/cli/tests/doctor.test.ts", sources: [S9, S13, S15] }
  - { id: A11, statement: "a diagram whose sendsBack states differ from the workflow's declared origins, or whose verified states differ from the steps declaring a verify, is refused at mount naming the state", proof: "deferred:test:packages/core/tests/define-workflow.test.ts", sources: [S8, S18] }
  - { id: A12, statement: "ticket-to-qa's self-review escalates a reply that ends with neither APPROVED nor CHANGES_ASKED", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/self-review.test.ts", sources: [S10] }
  - { id: A13, statement: "the built relay, in another process, climbs from sonnet to opus on a completed reply its step's verify refuses, and the handoff carries the verify's reason", proof: "assertion:relay.climbs_on_a_refused_verify", sources: [S1, S2, S10] }
  - { id: A14, statement: "the built ticket-to-qa, in another process, starts IMPLEMENTING on the second rung after GATE's rounds at its configured level ran out, and stays there for the rounds after", proof: "assertion:relay.a_round_from_an_origin_starts_higher", sources: [S11, S14] }
crosses:
  - { mechanism: agent-replies, answer: works, proof: "deferred:A1, A2, A12" }
  - { mechanism: attempts-and-waits, answer: works, proof: "deferred:A3, A5; a rate-limited run gives its attempt back as today and counts as no round" }
  - { mechanism: record-migration, answer: n/a, why: "breaking change (S15): no migration; a record without per-origin rounds reads every origin at zero" }
  - { mechanism: calls, answer: n/a, why: "define-workflow gains the verify and origin declarations; how a workflow calls another is unchanged" }
  - { mechanism: hooks, answer: n/a, why: "before, after and interrupt run around every plan as today; no hook reads an escalation" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "Agent.ts and Gate.ts gain a findings count on an outcome; no tracker or code-host write is added" }
  - { mechanism: diagram, answer: works, proof: "deferred:A11" }
  - { mechanism: config, answer: works, proof: "deferred:A9, A10" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A11; a mismatch is refused before any work is touched" }
guarantee:
  - { holds: "a reply the step's own verify refuses is asked of the next rung, told why", not_against: "a wrong answer no verify was written to catch" }
  - { holds: "a step whose work keeps coming back from the same origin moves up one rung per configured threshold and stays there", not_against: "an origin that sends work back without saying how much it found: its default level applies" }
  - { holds: "every number behind an escalation is written in config.yaml, and a missing or extra one is red in amy doctor", not_against: "a threshold set to a value that makes no sense for the work" }
failures:
  - { step: verify, when: "a step's verify throws", goes_to: "the action fails as any thrown action does; the ladder does not climb on a broken verify" }
  - { step: escalate, when: "the next round would start past the top rung", goes_to: "the origin's top-rung rounds count down, then the work escalates to a person (A8)" }
cut:
  - "a verify answered by a decision model (Jev, Clef): on the Decider port, after plans/a-decision-is-asked-of-a-port.md"
  - "whether a review that asks for changes goes back to IMPLEMENTING instead of HUMAN_FIX: its own plan"
  - "a private workflow's self-review checking every brief statement was judged: written in its own fork on this seam"
exit: "work whose gate keeps coming back red starts its next IMPLEMENTING on opus and stays there, a triage answer with no JSON goes to opus, and amy doctor is red until config.yaml names every threshold"
---
# A step escalates by where its work came back from

The ladder climbs only when the CLI errors, so a well-formed wrong answer
never reaches the stronger model. A step's `verify` judges a reply while the
relay can still climb, and `decide()` starts a round one rung higher once
work keeps coming back from the same origin. Every number is named in
`config.yaml`; the diagram marks the states, and all three are checked.

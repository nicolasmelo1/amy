---
base: a60165e3ac86124baf0705efbe953feddbc267ab
sources:
  - { id: S1, kind: decision, said: "the delivered escalation contract is repaired from its red regression tests: each returned kind of work keeps its own rounds, starts the configured rung, and stops at ESCALATED rather than reusing the old ceilings. Decided 2026-11-21" }
  - { id: S2, kind: decision, said: "ticket-to-qa declares the reply ports it reads and writes; the required list admits only conversation, code-host and tracker, and migration supplies the old behaviour explicitly. Decided 2026-11-21" }
  - { id: S3, kind: decision, said: "a repair preserves the delivered workflow contract: review threads are answered once, a recorded reviewer is re-requested, stack and host discovery use the declared ticket semantics, and a completed harness turn is not failed for an absent message. Decided 2026-11-21" }
touches:
  - packages/core/src/ports/CodeHost.ts
  - packages/agent-kit/src/HarnessRelay.ts
  - packages/agent-kit/src/handoff.ts
  - packages/agent-kit/src/steps.ts
  - packages/agent-kit/tests/HarnessRelay.test.ts
  - packages/agent-kit/tests/steps.test.ts
  - packages/cli/src/config-template.ts
  - packages/cli/src/update.ts
  - packages/cli/tests/config-template.test.ts
  - packages/cli/tests/doctor.test.ts
  - packages/cli/tests/escalation-config.test.ts
  - packages/cli/tests/two-workflows.test.ts
  - packages/cli/tests/update.test.ts
  - packages/test-fixtures/src/worker.ts
  - plugins/codex/src/CodexHarness.ts
  - plugins/codex/tests/a-turn-that-completed.test.ts
  - examples/a-whole-project/tests/project.test.ts
  - examples/workflow-ticket-to-qa/src/actions.ts
  - examples/workflow-ticket-to-qa/src/machine.ts
  - examples/workflow-ticket-to-qa/src/observation.ts
  - examples/workflow-ticket-to-qa/src/plugin.ts
  - examples/workflow-ticket-to-qa/src/record.ts
  - examples/workflow-ticket-to-qa/src/review.ts
  - examples/workflow-ticket-to-qa/src/state.ts
  - examples/workflow-ticket-to-qa/tests/branch.test.ts
  - examples/workflow-ticket-to-qa/tests/conformance.test.ts
  - examples/workflow-ticket-to-qa/tests/escalating.test.ts
  - examples/workflow-ticket-to-qa/tests/new-work.property.test.ts
  - examples/workflow-ticket-to-qa/tests/new-work.test.ts
  - examples/workflow-ticket-to-qa/tests/plugin.test.ts
  - examples/workflow-ticket-to-qa/tests/rung-by-origin.test.ts
  - examples/workflow-ticket-to-qa/tests/self-review.test.ts
  - examples/workflow-ticket-to-qa/tests/threads.test.ts
  - registry/agent-kit.json
  - registry/cli.json
  - registry/core.json
  - registry/plugin-codex.json
  - registry/workflow-ticket-to-qa.json
  - docs/development/the-gate.md
  - CONTRIBUTING.md
criteria:
  - { id: A1, statement: "every returned origin keeps its own rounds, starts its configured rung, and reaches ESCALATED at the top without reading legacy attempts", proof: "test:examples/workflow-ticket-to-qa/tests/rung-by-origin.test.ts", sources: [S1] }
  - { id: A2, statement: "ticket-to-qa requires repliesOn, reads and writes only its named ports, and update supplies the explicit former port set", proof: "test:examples/workflow-ticket-to-qa/tests/plugin.test.ts, test:packages/cli/tests/update.test.ts", sources: [S2] }
  - { id: A3, statement: "new work, threads, stack bases, host discovery, reviewer publication and unchanged runs follow the delivered workflow contract", proof: "test:examples/workflow-ticket-to-qa/tests/new-work.test.ts", sources: [S1, S3] }
  - { id: A4, statement: "relay handoff and completion classification preserve a refused reason and accept a completed turn without a message", proof: "test:packages/agent-kit/tests/HarnessRelay.test.ts", sources: [S3] }
crosses:
  - { mechanism: agent-replies, answer: works, proof: "A4" }
  - { mechanism: attempts-and-waits, answer: works, proof: "A1, A3" }
  - { mechanism: record-migration, answer: works, proof: "A1, A2" }
  - { mechanism: tracker-and-host-writes, answer: works, proof: "A2, A3" }
  - { mechanism: config, answer: works, proof: "A2" }
  - { mechanism: install-and-update, answer: works, proof: "A2" }
  - { mechanism: checkouts-and-leases, answer: works, proof: "A3" }
  - { mechanism: calls, answer: n/a, why: "the repair does not change workflow call bindings" }
  - { mechanism: hooks, answer: n/a, why: "the repair does not change hook ordering" }
  - { mechanism: diagram, answer: n/a, why: "the repair preserves the delivered diagram states" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "A2" }
guarantee:
  - { holds: "each returned origin escalates independently and no completed harness reply climbs unless its step refuses it", not_against: "a workflow that deliberately declares a different verify" }
  - { holds: "a reply is read and said only on ports the workflow config names", not_against: "a port implementation failing its own write" }
exit: "the delivered escalation contract is green under its regression tests, the published packages have current registries, and every stale gate is re-proven"
---
# The escalation repair proves what it says

The delivered escalation change left its claims red under review regressions. This repair turns those claims into a green workflow, adapter and configuration contract.

---
sources:
  - { id: S1, kind: friction, said: "2026-11-11: a private project's proof of a screen change ran only after review and merge; the person wants the screenshots before the pull request is opened, to put in it, and a proof that fails to stop the pull request" }
  - { id: S2, kind: code, ref: "packages/cli/src/project.ts", symbol: "projectDiagram", said: "the walk is BRIEF, WORK, PROVE, DONE: every end of WORK goes to PROVE, and WORK is ticket-to-qa, which ends at its QA handoff, after review and merge" }
  - { id: S3, kind: code, ref: "examples/workflow-ticket-to-qa/workflow.mmd", said: "the verdict, gate green and self-review approved, goes straight to PR_OPEN: nothing between the checks and the pull request can hold it" }
  - { id: S4, kind: reference, ref: "docs/design/a-project-is-brief-work-and-proof.md", said: "what BRIEF returned is what PROVE is asked to show; PROVE refused goes back to the phase before it" }
  - { id: S5, kind: reference, ref: "docs/design/a-workflow-calls-another.md", said: "a call state runs another workflow as a child record, and its ends move the caller only through the edges the caller drew" }
  - { id: S6, kind: reference, ref: "plans/a-proof-runs-against-its-own-branch.md", said: "a resource's commands are handed the work's worktree and branch, so a proof boots the code WORK produced" }
  - { id: S8, kind: friction, said: "2026-11-11: the private project's fork of this, a call at PROVING, fails ticket-to-qa's every-edge conformance on ten of the proving workflow's own edges, which only the proving suite walks" }
  - { id: S7, kind: decision, said: "the work calls the proof between its checks and its pull request: ticket-to-qa declares a slot there, a project fills it with prove/, and standing alone it passes on. Decided 2026-11-11" }
  - { id: S9, kind: friction, said: "2026-11-11: the private project's first proof was refused for a step no operation supports; it went back to IMPLEMENTING as a code failure, the agent changed nothing three times, and the escalation never named the step" }
  - { id: S10, kind: friction, said: "2026-11-11: the second proof answered every criterion, then the recording's stop step failed; no assertion read that step, yet the proof was refused and the work went back to IMPLEMENTING once more" }
  - { id: S11, kind: code, ref: "plugins/prove/src/plugin.ts", symbol: "refusalOf", said: "a refused proof carries one reason string: an assertion that did not hold, a step no operation supports, an unanswered human step and a failed step nothing reads are told apart nowhere" }
  - { id: S12, kind: code, ref: "examples/workflow-ticket-to-qa/src/outcomes.ts", symbol: "applyTransition", said: "attempts are cleared only on leaving ESCALATED; an IMPLEMENTING that succeeded keeps its count, so a return from PROVING starts where the last implementation stopped" }
  - { id: S13, kind: decision, said: "a refused proof also says what it could not decide: an unsupported step, an unanswered human step, or a failed step no assertion reads once every criterion is answered. Decided 2026-11-11, in the private project's fork" }
  - { id: S15, kind: decision, said: "undecided work goes to ESCALATED naming each step, charging no attempt, and the owner's answer proves the same revision again. Decided 2026-11-11, in the private project's fork" }
  - { id: S14, kind: decision, said: "leaving IMPLEMENTING for the checks clears its attempts. Decided 2026-11-11, in the private project's fork" }
touches:
  - packages/core/src/define-workflow.ts
  - packages/core/src/calls.ts
  - packages/core/src/index.ts
  - packages/core/tests/calls.test.ts
  - packages/cli/src/project.ts
  - packages/cli/tests/project.test.ts
  - examples/workflow-ticket-to-qa/workflow.mmd
  - examples/workflow-ticket-to-qa/src/machine.ts
  - examples/workflow-ticket-to-qa/src/plugin.ts
  - examples/workflow-ticket-to-qa/src/handover.ts
  - examples/workflow-ticket-to-qa/src/outcomes.ts
  - examples/workflow-ticket-to-qa/src/record.ts
  - examples/workflow-ticket-to-qa/tests/attempts.property.test.ts
  - examples/workflow-ticket-to-qa/tests/conformance.test.ts
  - examples/a-whole-project/tests/project.test.ts
  - plugins/prove/src/decide.ts
  - plugins/prove/src/plugin.ts
  - plugins/prove/tests/steps.test.ts
  - plugins/prove/tests/human-step.test.ts
  - packages/workflow-testkit/src/transitions.ts
  - packages/workflow-testkit/tests/conforms.test.ts
  - docs/guides/what-a-project-is.md
  - docs/design/a-project-is-brief-work-and-proof.md
criteria:
  - { id: A1, statement: "a declaration names a slot, a state a caller may fill with call(), and the edge it takes unfilled; filled, its child record's ends move the workflow through the edges the slot draws", proof: "deferred:test:packages/core/tests/calls.test.ts", sources: [S5, S7] }
  - { id: A2, statement: "a mount refuses a fill naming a state the workflow declares no slot for, and a callee one of whose ends the slot draws no edge for, naming the slot and the end", proof: "deferred:test:packages/core/tests/calls.test.ts", sources: [S5, S7] }
  - { id: A3, statement: "ticket-to-qa's verdict, both checks clean, goes to a PROVING slot before PR_OPEN; standing alone the slot goes straight on to PR_OPEN, and every conformance world walks as it did", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/conformance.test.ts", sources: [S3, S7] }
  - { id: A4, statement: "a project whose WORK declares the slot fills it with its prove/ phase, handed the brief's criteria and run against the work's branch; the walk is BRIEF, WORK, DONE, with no PROVE after WORK", proof: "deferred:test:packages/cli/tests/project.test.ts", sources: [S2, S4, S6, S7] }
  - { id: A5, statement: "a proof refused because an assertion did not hold, or that leaves a criterion the brief settled unanswered, sends the work back to IMPLEMENTING carrying what did not hold, counted against maxImplementAttempts; a proven one goes on to PR_OPEN", proof: "deferred:test:examples/a-whole-project/tests/project.test.ts", sources: [S1, S4, S7, S13, S15] }
  - { id: A6, statement: "the pull request opened after a proof names it and every file its steps kept, in the body amy writes or the turn it hands the operator", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/conformance.test.ts", sources: [S1] }
  - { id: A8, statement: "the workflow testkit's every-edge property holds a filled slot to the edges of its ends, and leaves the callee's inner edges to the callee's own suite", proof: "deferred:test:packages/workflow-testkit/tests/conforms.test.ts", sources: [S8] }
  - { id: A7, statement: "a project whose WORK declares no slot keeps BRIEF, WORK, PROVE and DONE, and its proof runs where it ran", proof: "deferred:test:packages/cli/tests/project.test.ts", sources: [S2, S4] }
  - { id: A9, statement: "a refused proof names, apart from what did not hold, what it could not decide: an unsupported step, an unanswered human step, a failed step no assertion reads once every criterion is answered", proof: "deferred:test:plugins/prove/tests/steps.test.ts", sources: [S9, S10, S11, S13] }
  - { id: A10, statement: "an undecided proof takes the work to ESCALATED naming each undecided step, charging no implement attempt; the owner's answer proves the same revision again, and a code change goes back to IMPLEMENTING as before", proof: "deferred:test:examples/a-whole-project/tests/project.test.ts", sources: [S9, S15] }
  - { id: A11, statement: "an implementation that reaches the checks clears IMPLEMENTING's attempts, so each return from PROVING has maxImplementAttempts of its own", proof: "deferred:property:examples/workflow-ticket-to-qa/tests/attempts.property.test.ts", sources: [S12, S14] }
crosses:
  - { mechanism: calls, answer: works, proof: "deferred:test:packages/core/tests/calls.test.ts" }
  - { mechanism: diagram, answer: works, proof: "deferred:test:examples/workflow-ticket-to-qa/tests/conformance.test.ts" }
  - { mechanism: workflow-tooling, answer: works, proof: "deferred:test:examples/workflow-ticket-to-qa/tests/conformance.test.ts" }
  - { mechanism: briefs, answer: works, proof: "deferred:test:packages/cli/tests/project.test.ts" }
  - { mechanism: attempts-and-waits, answer: works, proof: "deferred:test:examples/a-whole-project/tests/project.test.ts" }
  - { mechanism: tracker-and-host-writes, answer: works, proof: "deferred:test:examples/workflow-ticket-to-qa/tests/conformance.test.ts" }
  - { mechanism: record-migration, answer: n/a, why: "PROVING is a new state a record reaches only from a verdict; a record already past it walks on as it is" }
  - { mechanism: hooks, answer: n/a, why: "a slot is a call state; no hook is added or read" }
  - { mechanism: checkouts-and-leases, answer: n/a, why: "the proof's resources lease as they do; running the work's branch is a-proof-runs-against-its-own-branch's" }
guarantee:
  - { holds: "no pull request is opened for work whose proof did not pass", not_against: "a pull request a person opens by hand" }
  - { holds: "the proof a pull request names is the proof of the head it opens with", not_against: "a push to the branch by somebody else after it opened" }
failures:
  - { step: PROVING, when: "a resource does not come up or a fixture cannot be met", goes_to: "the proof's own wait or give-up, said in the work's thread; nothing is opened" }
  - { step: PROVING, when: "the proof is refused at the implement ceiling", goes_to: "ESCALATED, carrying what did not hold" }
  - { step: PROVING, when: "the proof could not decide a step", goes_to: "ESCALATED, naming each undecided step and how to settle it; the answer proves again" }
  - { step: ESCALATED, when: "the owner answers an undecided proof but the scenario still cannot run the step", goes_to: "ESCALATED again, naming the step; no implement attempt is charged" }
cut:
  - "proving again after review changes: a later plan, once the first proof holds"
  - "a slot anywhere but ticket-to-qa's PROVING: the mechanism is general, and this plan fills only that one"
exit: "a project of amy's shipped brief, ticket-to-qa and prove phases proves a ticket's branch before its pull request opens, on the fakes, and opens it naming the proof and its pictures"
---
# A proof runs before the pull request

A project proves its work after review and merge, because WORK is ticket-to-qa
and ends at the QA handoff: the pictures arrive after the review, and a proof
that fails cannot stop the pull request. A slot in ticket-to-qa between its
checks and its pull request lets a project call its proof there instead.

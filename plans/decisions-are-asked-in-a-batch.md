---
sources:
  - { id: S1, kind: code, ref: "packages/workflow-ticket-to-qa/src/machine.ts", said: "planHumanFix finds disagreements and, if any and not already escalated, advances to ESCALATED in the same look: \"${disagreed.length} comment(s) need the owner's call\"" }
  - { id: S2, kind: friction, said: "a bot reviewer's rounds interrupt the owner once per round with a decision; the first is taken before the second exists, while the PR still moves, so it may no longer apply" }
  - { id: S3, kind: friction, said: "one operator: many small decisions wear a person out, and nothing is lost holding them until the machine has settled everything it can" }
  - { id: S4, kind: decision, ref: "packages/workflow-ticket-to-qa/src/observation.ts", said: "policy.decisions, immediate by default so nothing changes for anybody who does not ask; immediate is today" }
  - { id: S5, kind: decision, said: "batch holds each round's disagreements on the record instead of escalating and keeps working the rest; it escalates when a round produces no new disagreement and some are held" }
  - { id: S6, kind: decision, said: "before sending, each held one is re-read against the PR as it stands; resolved, outdated by a later commit, or answered by the reviewer is dropped; the rest go in one message, ESCALATED once" }
  - { id: S7, kind: reference, ref: "plans/the-review-is-remembered-across-rounds.md", said: "held decisions are not deferred work: that plan gives a thread a verdict outliving the round; this keeps the moment of asking. A round only repeating settled subjects produces nothing new, so it sends the batch" }
  - { id: S8, kind: decision, said: "a gate red past its attempts, a PR too large for an agent, and an empty roster are not review decisions; nothing moves until answered, so they escalate as today" }
  - { id: S9, kind: decision, said: "a held disagreement is its review thread id: a round finding a thread already held replaces that entry and is not new; answered means a reply by the thread's original author after the hold. Decided 2026-11-08" }
  - { id: S10, kind: decision, said: "a non-review escalation (S8) firing while decisions are held carries them in the same message; they are neither dropped nor left waiting. Decided 2026-11-08" }
  - { id: S11, kind: decision, said: "success reads at least one item; a declared refusal is a condition this plan names; anything else is an internal error, never retried as expected; a check that read nothing is never green. Decided 2026-11-08" }
touches:
  - packages/workflow-ticket-to-qa/src/machine.ts
  - packages/workflow-ticket-to-qa/src/record.ts
  - packages/workflow-ticket-to-qa/src/observation.ts
  - packages/workflow-ticket-to-qa/src/plugin.ts
  - packages/workflow-ticket-to-qa/tests/machine.test.ts
  - packages/workflow-ticket-to-qa/tests/plugin.test.ts
  - packages/workflow-ticket-to-qa/tests/walkthrough.test.ts
  - packages/workflow-ticket-to-qa/tests/decisions.property.test.ts
criteria:
  - { id: A1, statement: "with immediate, a disagreement escalates in the look it is found, as today", proof: "deferred:test:packages/workflow-ticket-to-qa/tests/machine.test.ts", sources: [S1, S4] }
  - { id: A2, statement: "with batch, a round with a disagreement does not escalate and the rest of its changes are made", proof: "deferred:property:packages/workflow-ticket-to-qa/tests/decisions.property.test.ts#batch_read_as_immediate", sources: [S2, S3, S5] }
  - { id: A3, statement: "two rounds with one disagreement each, then a round with none, escalate once with both", proof: "deferred:walkthrough in the testkit", sources: [S5, S6, S7] }
  - { id: A4, statement: "a held disagreement whose thread was resolved or outdated before the batch is sent is dropped from it", proof: "deferred:walkthrough in the testkit", sources: [S6] }
  - { id: A5, statement: "a batch whose every held decision was dropped escalates nothing and the work moves on", proof: "deferred:walkthrough in the testkit", sources: [S6] }
  - { id: A6, statement: "a gate red past its attempts escalates at once under batch", proof: "deferred:test:packages/workflow-ticket-to-qa/tests/machine.test.ts", sources: [S8] }
  - { id: A7, statement: "an unknown policy.decisions value is refused at boot by name", proof: "deferred:test:packages/workflow-ticket-to-qa/tests/plugin.test.ts", sources: [S4] }
  - { id: A8, statement: "a round that finds a thread already held escalates nothing and replaces that thread's held entry, so the batch carries it once", proof: "deferred:property:packages/workflow-ticket-to-qa/tests/decisions.property.test.ts#a_held_thread_is_held_once", sources: [S5, S9] }
  - { id: A9, statement: "a held thread answered by its original author after the hold is dropped from the batch; a reply by anybody else keeps it", proof: "deferred:test:packages/workflow-ticket-to-qa/tests/machine.test.ts", sources: [S6, S9] }
  - { id: A10, statement: "a gate red past its attempts while two decisions are held escalates once, and the message carries the gate and both decisions", proof: "deferred:test:packages/workflow-ticket-to-qa/tests/machine.test.ts", sources: [S8, S10] }
  - { id: A11, statement: "a held thread the PR read cannot resolve (a thread id GitHub no longer returns, an unreadable review) is an internal error on that look, never read as resolved and dropped", proof: "deferred:test:packages/workflow-ticket-to-qa/tests/machine.test.ts", sources: [S6, S11] }
crosses:
  - { mechanism: record-migration, answer: works, proof: "deferred:A1; immediate is the default, so a record saved with no held decisions plans as today" }
  - { mechanism: config, answer: works, proof: "deferred:A7; policy.decisions is refused at boot by name, as policy.writes and policy.conversation are" }
guarantee:
  - { holds: "held disagreements are kept on the record, so a restart between rounds loses none", not_against: "a held thread whose objection was edited in place upstream: it is re-read for resolved, outdated or answered, not for what it now says" }
  - { holds: "the batch is true of the pull request when it is sent", not_against: "the pull request moving after the message is sent: the owner's answer is read as today" }
  - { holds: "a round with no new disagreement sends what is held", not_against: "a reviewer that finds something new every round: the batch waits for a quiet round, however long that is" }
  - { holds: "a disagreement is asked once however many rounds repeat it, and is dropped only on its own author's answer", not_against: "a thread whose original author is the bot itself and replies on its own: that reply is an answer" }
cut:
  - "holding non-review escalations (gate red past attempts, PR too large, empty roster) under batch: refused (S8)"
exit: "under policy.decisions: batch, three review rounds that find one, one and zero decisions reach the owner as one message carrying the two that still apply, after the third round and not before"
---
# Decisions are asked in a batch

`ticket-to-qa` escalates a review disagreement the moment it finds it, so an owner who would rather decide once is interrupted every round, on decisions that may stop applying while the pull request still moves.

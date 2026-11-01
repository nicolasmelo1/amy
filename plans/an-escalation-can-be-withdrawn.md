---
sources:
  - { id: S1, kind: friction, said: "ESCALATED is left only when a person answers, and the per-state attempt counters stay at the ceiling; a defect-caused escalation is recovered only by hand-editing record JSON unseen by the daemon; five records in one evening" }
  - { id: S2, kind: decision, said: "a workflow's escalation is withdrawn by an observation, a reply from the person it named, and nothing else: the correct default; a machine that un-escalates itself cannot be trusted to stop" }
  - { id: S3, kind: code, ref: "packages/core/src/work.ts", said: "attempts is per state and folded by applyPlan before the workflow's own apply runs (work.ts:80); nothing in the CLI can clear it" }
  - { id: S4, kind: code, ref: "packages/cli/src/index.ts", said: "amy poke brings the next look forward (index.ts:493), re-reads the same ceiling and escalates again, so it is not a recovery; a fixed defect leaves records parked forever" }
  - { id: S5, kind: reference, ref: "docs/design/the-threads-close-when-they-are-answered.md", said: "that evening three records parked on a missing capability, automated threads nobody could close, now delivered" }
  - { id: S6, kind: friction, said: "two records parked on a counter that charged a branch checkout to the implementing state, so one real round was billed as three" }
  - { id: S7, kind: friction, said: "repair by hand, per record: stop the loop, copy the file aside, set state to where it stopped, empty attempts, drop the workflow-folded fields, append a history entry, restart the loop" }
  - { id: S8, kind: friction, said: "the daemon can rewrite the record in the same second, with no lock and no is-this-claimed to ask, so that window is the whole risk" }
  - { id: S9, kind: friction, said: "the stale fields are known only by reading the workflow's apply (its remember, once a workflow is one declaration lands); they are not core fields, and an operator cannot enumerate them" }
  - { id: S10, kind: decision, said: "amy withdraw <workId>... [--to <state>] (e.g. amy withdraw TBO-1241 TBO-1242 --to COPILOT_FIX) refuses while the work is claimed or in flight: the half a person cannot do safely by hand, why it is a command" }
  - { id: S11, kind: decision, said: "it backs the record up beside it (the store is one file per record; a sibling with another extension is invisible to all()) and prints what changed" }
  - { id: S12, kind: reference, ref: "docs/design/waiting-is-not-trying.md", said: "a withdrawal clears the attempts and the looks of the state it resumes into, and of the state it leaves" }
  - { id: S13, kind: decision, said: "a withdrawal appends a history entry saying a person resumed it, so amy status and the log still tell the truth about how it got there" }
  - { id: S14, kind: reference, ref: "docs/design/a-workflow-is-a-mermaid-diagram.md", said: "--to is optional only when the workflow says where: a state marked returns sends the record back to the state its last history entry came from, read by the core without asking" }
  - { id: S15, kind: reference, ref: "docs/design/a-workflow-is-three-pieces.md", said: "core knows state, attempts, looks, history; the rest is the workflow's, so defineWorkflow takes optional resumeTarget?(record: R): string | null and resumed?(record: R, to: string): R beside remember" }
  - { id: S16, kind: decision, said: "core does the safe half (claim check, backup, attempts, history) and asks the workflow the rest; a workflow implementing neither resumes with --to, and refuses rather than guesses without one" }
  - { id: S17, kind: decision, said: "amy attempts <workId> --clear <state> covers the narrower case: the state is right and only the counter is a lie" }
  - { id: S18, kind: reference, ref: "plans/a-plugin-brings-its-own-commands.md", said: "ordered first, it removes pause and resume, and amy stop --all / amy start become the handbrake; so a withdrawal is its own command, not a form of resume" }
  - { id: S19, kind: decision, ref: "packages/core/src/event-contract.ts", said: "the log grows a work.resumed kind, so the repair is an event like every other thing that happened to the work" }
  - { id: S20, kind: decision, said: "the CLI tests drive the command against a real store and queue, as poke is; the workflow's half, dropping its own escalation fields, is proven where the fold lives" }
touches:
  - packages/cli/src/index.ts
  - packages/core/src/define-workflow.ts
  - packages/core/src/event-contract.ts
  - packages/core/events.json
  - packages/workflow-ticket-to-qa/src/plugin.ts
  - packages/cli/tests/withdraw.test.ts
  - packages/cli/tests/attempts.test.ts
  - packages/workflow-ticket-to-qa/tests/plugin.test.ts
  - packages/core/tests/event-contract.test.ts
criteria:
  - { id: A1, statement: "a resumed record starts its next look with no attempts spent in the state it re-enters", proof: "test:packages/cli/tests/withdraw.test.ts", sources: [S1, S3, S4, S5, S6, S12, S20] }
  - { id: A2, statement: "a withdrawal refuses a piece of work that is claimed or in flight", proof: "test:packages/cli/tests/withdraw.test.ts", sources: [S7, S8, S10, S18] }
  - { id: A3, statement: "the record is backed up before it is changed, and the backup is not listed as work", proof: "test:packages/cli/tests/withdraw.test.ts", sources: [S11] }
  - { id: A4, statement: "the history says a person resumed it, and amy status still tells the truth about how it got there", proof: "test:packages/cli/tests/withdraw.test.ts", sources: [S13] }
  - { id: A5, statement: "a workflow that folds its own escalation fields drops them on resume", proof: "test:packages/workflow-ticket-to-qa/tests/plugin.test.ts", sources: [S9, S15, S20] }
  - { id: A6, statement: "a workflow that implements no hook still resumes with --to, and refuses rather than guesses without one", proof: "test:packages/workflow-ticket-to-qa/tests/plugin.test.ts", sources: [S2, S14, S16] }
  - { id: A7, statement: "amy attempts --clear resets one state's counter and touches nothing else", proof: "test:packages/cli/tests/attempts.test.ts", sources: [S17] }
  - { id: A8, statement: "the log carries a work.resumed line the contract knows", proof: "test:packages/core/tests/event-contract.test.ts", sources: [S19] }
crosses:
  - { mechanism: events-and-notifications, answer: works, proof: "deferred:A8" }
  - { mechanism: calls, answer: n/a, why: "defineWorkflow only gains two optional members asked by amy withdraw; how a workflow calls another is unchanged" }
  - { mechanism: hooks, answer: n/a, why: "resumeTarget and resumed are asked by amy withdraw, not run around a plan; before, after and interrupt are unchanged" }
failures:
  - { step: amy withdraw, when: "the work is claimed or in flight", goes_to: "refused; the record is untouched" }
  - { step: amy withdraw without --to, when: "the state is not marked returns and the workflow has no resumeTarget", goes_to: "refused rather than guessed" }
cut:
  - "a machine that un-escalates itself: refused (S2)"
  - "resuming by a script outside amy: refused; the claim check cannot be done safely by hand"
exit: "a record that escalated on a defect comes back by a command, counter honest, history truthful, and the daemon never once raced the repair"
---
# An escalation can be withdrawn

When an escalation was caused by a defect rather than by the work, the only recovery is editing the record JSON by hand while the daemon might rewrite it, and a fixed defect never reaches the records it parked.

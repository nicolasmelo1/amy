---
base: d14155c16e9669f5462df4f9e2fa91fc2ac3be02
sources:
  - { id: S1, kind: code, ref: "packages/cli/src/project.ts", symbol: "refusedBrief", said: "the project's GROOMED gate judges the brief stored under the unit's own work id: refusedBrief(briefs, record.id, ...) reads store.get(id)" }
  - { id: S2, kind: code, ref: "packages/cli/src/index.ts", symbol: "brief", said: "`amy brief show|check <id>` read the brief stored under the id they are given, the unit's" }
  - { id: S3, kind: code, ref: "examples/workflow-ticket-to-qa/src/actions.ts", symbol: "requireTicketWithBrief", said: "requireTicketWithBrief resolves a ticket's brief only through ticket.briefId, and returns the ticket without one when briefId is unset or names nothing the store holds" }
  - { id: S4, kind: code, ref: "examples/workflow-ticket-to-qa/src/lanes.ts", symbol: "selfReviewLane", said: "the self-review lane reads the brief through ticket.briefId alone" }
  - { id: S5, kind: code, ref: "examples/workflow-ticket-to-qa/src/actions.ts", symbol: "ACTIONS", said: "ask-question appends triage's questions to the brief ticket.briefId names, and to none when it is unset" }
  - { id: S6, kind: code, ref: "plugins/linear/src/LinearTracker.ts", symbol: "toTicket", said: "a ticket's briefId is its parent's identifier, and a ticket with no parent carries none" }
  - { id: S7, kind: reference, ref: "docs/design/a-brief-reaches-every-ticket-it-explains.md", said: "in the machine the shipped workflow drives, the brief id is the tracker parent" }
  - { id: S8, kind: reference, ref: "docs/design/a-project-is-brief-work-and-proof.md", said: "a project walks one unit through brief, work and proof; the brief phase grooms that unit" }
  - { id: S9, kind: friction, said: "a private project groomed one brief per ticket under the ticket's own id; the GROOMED gate went green, the work phase read no brief, and triage asked a question the brief's cut list already answered" }
  - { id: S10, kind: decision, said: "one core function resolves the brief a unit is worked against, for the gate, `amy brief` and every ticket step: the unit's own brief first, the tracker's briefId only when there is none" }
  - { id: S11, kind: decision, said: "the tracker keeps saying what it knows: briefId stays the parent's identifier, and a feature-level brief keeps reaching every child that has no brief of its own" }
  - { id: S12, kind: decision, said: "a question triage asks is appended to the brief the ticket was read with, so it lands where the answer will be written" }
touches:
  - registry/core.json
  - packages/core/src/ports/Brief.ts
  - packages/core/src/ports/Ticketing.ts
  - packages/core/src/index.ts
  - packages/core/tests/Brief.test.ts
  - examples/workflow-ticket-to-qa/src/actions.ts
  - examples/workflow-ticket-to-qa/src/lanes.ts
  - examples/workflow-ticket-to-qa/tests/briefs.test.ts
  - examples/workflow-ticket-to-qa/tests/self-review.test.ts
  - .software-factory/evidence/project-phases-scenario.sh
criteria:
  - { id: A1, statement: "briefOf(store, { workId, briefId }) answers the brief stored under the unit's own id when there is one, the brief briefId names when there is not, and null when neither exists", proof: "deferred:test:packages/core/tests/Brief.test.ts", sources: [S10, S11] }
  - { id: A2, statement: "a ticket with a brief under its own id is observed with that brief's text, whether its briefId names a parent or is unset", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/briefs.test.ts", sources: [S3, S6, S9, S10] }
  - { id: A3, statement: "a ticket whose own id holds no brief still reads the brief its parent names, as it does today", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/briefs.test.ts", sources: [S7, S11] }
  - { id: A4, statement: "the self-review lane reads the same brief the ticket was observed with", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/self-review.test.ts", sources: [S4, S10] }
  - { id: A5, statement: "triage's questions are appended to the brief the ticket was read with, its own when it has one", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/briefs.test.ts", sources: [S5, S12] }
  - { id: A6, statement: "in a project of brief and work, a unit whose brief the GROOMED gate judged green reaches the work phase's triage prompt with that brief's text", proof: "deferred:test:.software-factory/evidence/project-phases-scenario.sh", sources: [S1, S2, S8, S9] }
crosses:
  - { mechanism: briefs, answer: works, proof: "deferred:test:examples/workflow-ticket-to-qa/tests/briefs.test.ts" }
  - { mechanism: agent-replies, answer: works, proof: "deferred:test:.software-factory/evidence/project-phases-scenario.sh" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "no write changes: briefId is read as the tracker gives it, and the store's appendQuestion is the only write, to a brief that already exists" }
guarantee:
  - { holds: "the brief the GROOMED gate and `amy brief check` judge for a unit is the brief that unit's ticket steps read", not_against: "a unit whose own id holds no brief while its parent's does: the gate refuses it as ungroomed, and the work, run without the project, still reads the parent's" }
  - { holds: "a machine with no brief under any ticket's own id behaves exactly as today", not_against: "a brief written under a ticket's id by hand: it is the ticket's own brief from then on" }
failures:
  - { step: observe, when: "the store fails to read the brief under the unit's own id", goes_to: "the error is thrown naming the id, as a failed read of briefId is today; it is not read as no brief" }
  - { step: triage, when: "a ticket was triaged without a brief, and its own brief is written after", goes_to: "the next look reads it; questions already asked stay asked, and the answer in the thread is part of the ticket as today" }
cut:
  - "re-keying the tracker's briefId to the ticket itself: the parent is a fact the tracker knows, and a feature-level brief must keep reaching every child (S11)"
  - "merging a ticket's own brief with its parent's: one brief is read, never two folded together"
  - "re-triaging a ticket whose question was asked before its brief existed"
exit: "a unit groomed under its own id is worked, reviewed and questioned against the brief its project judged, and a ticket with only a feature-level brief reads it as before"
---
# A ticket reads the brief its project judged

A project's GROOMED gate and `amy brief check` read the brief under the
unit's own id, while ticket-to-qa reads only the tracker's parent `briefId`.
A brief groomed for the ticket itself passes the gate and is never read by
the work. One core `briefOf` resolves both: own id first, `briefId` after.

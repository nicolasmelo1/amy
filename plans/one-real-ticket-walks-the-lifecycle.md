---
sources:
  - { id: S1, kind: reference, ref: "docs/design/the-lifecycle-is-proven-end-to-end.md", said: "drives the installed executable through every state against stand-ins, twice, no credential, no network; its last criterion, one real ticket, was carried deferred in a delivered plan, and lives here since delivered notes stopped promising" }
  - { id: S2, kind: decision, said: "the stand-ins are held to Linear's and GitHub's vendored contracts, and a contract is not the service: it cannot show a renamed status, a permission the token lacks, or a reviewer never getting the request" }
  - { id: S3, kind: decision, said: "one ticket moved into the real tracker's working status is picked up by the installed amy on a real repository, implemented, gated, given a roster reviewer who reviews it, merged and handed to QA; nothing stood in" }
  - { id: S4, kind: reference, ref: "docs/design/a-phase-is-proven-not-asserted.md", said: "lets a person record a manual run as the proof, naming who ran it and when, locked to the code it ran against; this row comes after it, since a run no check can read is a claim" }
  - { id: S5, kind: decision, said: "the record keeps what the run shows: the states passed, the moves and their why, the pull request's number; no ticket text, customer or colleague's name: those belong to the tracker, and this repository is public" }
touches:
  - packages/cli/tests/manual-proof.test.ts
  - packages/cli/tests/manual-proof.property.test.ts
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "one ticket in the real tracker goes from the working status to QA through the installed amy, with a roster reviewer who reviewed it, and a person records that run as the proof", proof: "deferred:assertion:proof.a_manual_run_is_a_proof", sources: [S1, S2, S3, S4] }
  - { id: A2, statement: "the recorded run names the states the record walked and its pull request, and nothing a ticket or a colleague wrote", proof: "deferred:property:packages/cli/tests/manual-proof.property.test.ts#move_reason_quotes_the_ticket", sources: [S5] }
crosses:
  - { mechanism: tracker-and-host-writes, answer: works, proof: "deferred:A1, against the real Linear and GitHub, each write made or handed to the operator as its policy says" }
  - { mechanism: install-and-update, answer: n/a, why: "the run uses amy as installed; nothing is installed or updated by this work" }
  - { mechanism: record-migration, answer: n/a, why: "the run starts a fresh record; no record an older version saved is read" }
guarantee:
  - { holds: "the recorded run names the states, the moves and their why, and the pull request's number, nothing a ticket or a colleague wrote", not_against: "what the pull request itself shows to anyone with access to its repository" }
  - { holds: "the proof is locked to the code it ran against and names who ran it and when", not_against: "a person recording a run that did not happen as they say: a manual proof is that person's word" }
  - { holds: "one ticket walked the real tracker and code host once", not_against: "a status renamed, a permission revoked or a reviewer gone after the run: it proves those services that day, not later" }
exit: "a person walks one real ticket from the working status to QA, records the run as the proof, and the ticket-to-qa gate reads that record as locked to the code it ran against"
---
# One real ticket walks the lifecycle

The lifecycle is proven only against stand-ins held to vendored contracts, and a contract is not the service. One real ticket, with a real reviewer, is the criterion that proof left deferred.

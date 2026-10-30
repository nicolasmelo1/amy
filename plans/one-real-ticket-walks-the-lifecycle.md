# One real ticket walks the lifecycle

[The lifecycle is proven end to end](../docs/design/the-lifecycle-is-proven-end-to-end.md)
drives the installed executable through every state against a world of
stand-ins, twice, with no credential and no network. Its last criterion was one
real ticket, in the real tracker, with a real reviewer, and it was carried as
`deferred` inside a plan already marked delivered. The stand-ins are held to
the vendored contracts of Linear and GitHub, and a contract is not the service:
it cannot show a status name somebody renamed, a permission the token lacks, or
a reviewer who never gets the request.

That criterion left the delivered note when delivered notes stopped being
allowed to promise anything. This plan is where it lives now.

## What changes

**A person walks one ticket, and the run is recorded as its proof.** One
ticket, moved into the working status of the real tracker, is picked up by the
installed `amy` on a real repository, implemented, gated, given a reviewer from
the roster, reviewed by that person, merged and handed to QA. Nothing is
stood in for.

**The proof is the manual run [a phase is proven, not
asserted](a-phase-is-proven-not-asserted.md) records.** That plan lets a person
record a manual run as the proof, naming who ran it and when, and locks it to
the code it ran against. This row comes after it, because a run that leaves
nothing a check can read is a claim, and this row exists to replace a claim.

**What the record keeps is what the run shows, not what the ticket says.** The
states the record passed through, the moves and their `why`, and the pull
request's number. No ticket text, no customer and no colleague's name: those
belong to the tracker, and this repository is public.

## Acceptance criteria

- [ ] One ticket in the real tracker goes from the working status to QA through
      the installed `amy`, with a reviewer from the roster who reviewed it, and
      a person records that run as the proof
      (proof: deferred:assertion:proof.a_manual_run_is_a_proof)
- [ ] The recorded run names the states the record walked and its pull request,
      and nothing a ticket or a colleague wrote
      (proof: deferred:test:packages/cli/tests/manual-proof.test.ts)

**Exit condition:** a person walks one real ticket from the working status to
QA, records the run as the proof, and the `ticket-to-qa` gate reads that record
as locked to the code it ran against.

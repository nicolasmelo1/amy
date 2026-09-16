# The ports belong to the core

Delivered. `Tracker`, `Agent`, `Gate`, `Ticket` and the outcome contracts
they carry live in `packages/core/src/ports/Ticketing.ts`, beside `CodeHost`
and `Harness`; the workflow re-exports every name for one minor version, and
the plugins import from the core. What proves it is `packages/core/tests/ports.test.ts`
for the exports and the write-capability vocabulary, `packages/workflow-ticket-to-qa/tests/index.test.ts`
for the re-export promise, and the gates the scenario runs for the install
that resolves one copy of the core. The plan that came before kept the
argument below; what it promised is the acceptance criteria at the end.

`L0.CORE_STAYS_IGNORANT` says it plainly: *"the moment it imports a workflow it
learns a domain, and every workflow after the first becomes a fork instead of a
package."* The core obeys. The plugins did not.

`Tracker`, `Agent` and `Gate` were ports, and all three lived inside
`packages/workflow-ticket-to-qa/src/ports/`. Four plugins imported from there:
`@amykit/plugin-linear` (a plugin, and the one an install cannot run without)
depended on `@amykit/workflow-ticket-to-qa`, a workflow. The rule protected
the core from exactly this and stopped one layer short.

## What it cost the second workflow

A workflow that is not `ticket-to-qa` had two options, and both were bad. It
could depend on the shipped workflow for its port types, which made the
shipped one a contract library that happens to also contain a state machine.
Or it could declare the ports by hand — which a private workflow did, and
re-declared `createFollowUp` as `{ ticketId, why }` against an adapter
reading `{ parentTicketId, title, body }`. Every escalation that workflow
raised got `400 Bad Request` out of `issueCreate`. A contract restated is a
contract that can disagree, and both defects were the same defect.

## What changed

The contracts moved to the core; the plugins import them from there; the
workflow re-exports them so nothing breaks on the way past. Nothing about
the *shape* changed — this is where they live, not what they say.

The move also split the tracker contract along the seam the next plan
needs: `TrackerReads` and `TrackerWrites` are separate interfaces, so a
mount can hand a workflow the read half without the write half, and
`TRACKER_WRITE_CAPABILITIES` names the write each core action resolves to.
That vocabulary is the core's, the same way the action catalogue is: it is
what lets a boot refusal say which capability a workflow failed to claim,
without the core learning what a workflow's policy means.

## Acceptance criteria

- [x] `Tracker`, `Agent`, `Gate` and `Ticket` are exported from `@amykit/core`
      (proof: test:packages/core/tests/ports.test.ts)
- [x] No plugin imports from a workflow package
      (proof: test:packages/core/tests/ports.test.ts)
- [x] `workflow-ticket-to-qa` still exports them, from the core
      (proof: test:packages/workflow-ticket-to-qa/tests/index.test.ts)
- [x] A workflow declares its dependencies as the core's contracts and nothing
      is restated by hand
      (proof: unspecified:the proof is the diff that deletes `RevvDeps`, in a repository this one does not contain)
- [x] The install scenario still drives a ticket with the plugins resolving one
      copy of the core (proof: test:.software-factory/evidence/installed-plugins-scenario.sh)

**Exit condition:** a workflow nobody shipped declares every port it needs by
importing `@amykit/core`, and no plugin in the install depends on a workflow
package to know what a tracker is.
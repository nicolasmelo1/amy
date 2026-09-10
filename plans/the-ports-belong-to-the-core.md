# The ports belong to the core

`L0.CORE_STAYS_IGNORANT` says it plainly: *"the moment it imports a workflow it
learns a domain, and every workflow after the first becomes a fork instead of a
package."* The core obeys. The plugins do not.

`Tracker`, `Agent` and `Gate` are ports, and all three live inside
`packages/workflow-ticket-to-qa/src/ports/`. Four plugins import from there:

```
plugins/linear/src/ticketChannel.ts:1      Tracker
plugins/command-gate/src/CommandGate.ts:2  Gate, AttemptOutcome, Ticket
plugins/agent-relay/src/plugin.ts:28       Agent, AttemptOutcome, ThreadVerdict, Ticket, TriageOutcome
```

So `@amykit/plugin-linear` — a plugin, and the one an install cannot run
without — depends on `@amykit/workflow-ticket-to-qa`, a workflow. The rule
protects the core from exactly this and stops one layer short.

## What it costs the second workflow

A workflow that is not `ticket-to-qa` has two options, and both are bad. It can
depend on the shipped workflow for its port types, which makes the shipped one
a contract library that happens to also contain a state machine. Or it can
declare the ports by hand, which `@nicolasmelo1/workflow-revv` does — 60 lines
of `RevvDeps` restating twelve methods, under a comment that says why:

> It used to return `any`, which meant every port arrived unchecked and a
> workflow could call a method no adapter has. That is not hypothetical: `log`
> was typed by hand as `{ record(event) }` against a port whose only method is
> `append`, and `tsc` had nothing to say about it.

The same file then re-declared `createFollowUp` as `{ ticketId, why }` against
an adapter reading `{ parentTicketId, title, body }`, and every escalation that
workflow raised got `400 Bad Request` out of `issueCreate`. Both defects are
the same defect: a contract restated is a contract that can disagree.

## What changes

`Tracker`, `Agent`, `Gate` and `Ticket` move to `packages/core/src/ports/`,
beside `CodeHost` and `Harness`, which are already there and already exported.
`workflow-ticket-to-qa` re-exports them for one minor version so nothing breaks
on the way past. The plugins import from the core.

Nothing about the *shape* changes. This is where they live, not what they say.

`L0.CORE_STAYS_IGNORANT` grows a sibling, saying of a plugin what that one says
of the core: the invariant is the same and the layer below is where it was
lost.

## Acceptance criteria

- [ ] `Tracker`, `Agent`, `Gate` and `Ticket` are exported from `@amykit/core`
      (proof: test:packages/core/tests/ports.test.ts)
- [ ] No plugin imports from a workflow package
      (proof: unspecified:the sibling rule and its mutation fixture are what this plan delivers)
- [ ] `workflow-ticket-to-qa` still exports them, from the core
      (proof: test:packages/workflow-ticket-to-qa/tests/index.test.ts)
- [ ] A workflow declares its dependencies as the core's contracts and nothing
      is restated by hand
      (proof: unspecified:the proof is the diff that deletes `RevvDeps`, in a repository this one does not contain)
- [ ] The install scenario still drives a ticket with the plugins resolving one
      copy of the core (proof: test:.software-factory/evidence/installed-plugins-scenario.sh)

**Exit condition:** a workflow nobody shipped declares every port it needs by
importing `@amykit/core`, and no plugin in the install depends on a workflow
package to know what a tracker is.

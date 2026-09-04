# The engine drives a workflow it does not know

The question was whether a second workflow can reuse the plugins or has to
duplicate them. The answer was: the plugins, yes; the engine, no.

`Worker.ts` was 748 lines with 36 references to the ticket domain. It built
the observation out of a tracker, held a handler per ticket action, folded a
gate result it had to understand, registered `ticketToQa` itself, and read
`repos` and `qaStatusName` out of its own settings. `decide` was injectable,
so the *decision* could be swapped — and nothing else could.

That made the roadmap's own strongest claim untestable. Phase 13 says a
second workflow that reuses queue, gate, relay, budget and report while
sharing no action is the strongest proof the plugin model can receive. With
the engine as it was, that proof would have failed at the engine rather than
at the model, and it would have failed by needing a second copy of 748 lines.

## The seam, and why it is this one

The mechanism already existed here twice: a **collection** is how the
notification channels reach the fan-out without the core learning the word
"channel", and how today's roster reaches a tick without being a port. The
same shape, one level up.

`WorkflowRuntime` is what a workflow contributes:

- `found()` — work that exists and is not queued yet
- `newRecord()` — what a work id starts as
- `observe(record)` — the snapshot the decision reads
- `handlers()` — one per action it can emit
- `apply(record, plan, outcomes, observation, now)` — the fold only it can do
- `policy` — the ceilings its own decision function reads

What stayed in the engine is the half that names nothing: claim an item,
recover an abandoned one, ask the budget before spending an agent, park
rather than lose, count attempts across processes, warn once on the way down
and once on the way back, stop between actions, prune, and chain the next
look. Those are true of any workflow, and none of them mentions a ticket.

The observation is in `apply` for a reason worth keeping: not everything a
record learns comes from an action. The owner's answer to an escalation
arrives as an observation, and the move it unblocks carries no action at all,
so a fold that could not see one would leave the record waiting forever.

## What this is not

It is not two workflows at once. `mount()` still claims a single workflow, so
an install drives one; two means two configs and two state directories, which
is the right shape for now and is not what phase 13 needs.

It is not a domain-free `Agent`, `Tracker`, `CodeHost` or `Gate` either. Those
four contracts are declared by this workflow and typed on its `Ticket`, which
is deliberate — type safety comes from the workflow's side. So a second
workflow over the *same* domain reuses every adapter and costs a `plan()`; a
second workflow over a different domain reuses the harnesses, the queue, the
store, the log, the notifiers, the relay's ladder and the budget, and brings
its own adapters. That is the honest boundary, and it is the one an ARC
workflow would meet.

## Acceptance criteria

- [x] The engine imports nothing from any workflow package, and no noun in it
      names a domain
      (proof: test:plugins/serial-engine/tests/plugin.test.ts)
- [x] The workflow contributes both halves — the order of its states and how
      its actions run — as a plugin
      (proof: test:packages/workflow-ticket-to-qa/tests/plugin.test.ts)
- [x] A workflow that registers itself and contributes no runtime is refused
      by name, with what there was to choose from
      (proof: test:plugins/serial-engine/tests/plugin.test.ts)
- [x] A port the workflow needs and nobody mounted is refused at boot, naming
      the port
      (proof: test:packages/workflow-ticket-to-qa/tests/plugin.test.ts)
- [x] The engine reports an action the runtime brought no handler for, and a
      hand-written runtime with one handler proves it
      (proof: test:plugins/serial-engine/tests/Worker.test.ts)
- [x] The workflow's vocabulary — its repositories, its QA status, its policy
      — is in the workflow's own settings slice, not the engine's
      (proof: test:packages/cli/tests/slices.test.ts)
- [x] Everything the engine promised about a bad day still holds: one warning
      on the way down, one on the way back, a broken channel or log costing no
      move (proof: assertion:engine.warns_once_on_the_first_failure)
- [x] The lifecycle still walks end to end, unchanged, through the installed
      executable
      (proof: assertion:lifecycle.the_ticket_walks_the_lifecycle_in_order)
- [ ] A second workflow, over a domain sharing no action with this one, runs
      on this engine unmodified
      (proof: deferred:that workflow is phase 13, and it is the run that
      settles this rather than an argument about it)

**Exit condition:** `plugins/serial-engine/src/**` contains no reference to
any `@amy/workflow-*` package, the five end-to-end scenarios pass unchanged
against the built artifacts, and a second workflow can be driven by handing
the same engine a `Workflow` and a `WorkflowRuntime`.

The last criterion is the one that matters and it stays open on purpose. The
seam is only proven by a second thing going through it, and inventing a
throwaway second workflow to close a checkbox would prove the checkbox.

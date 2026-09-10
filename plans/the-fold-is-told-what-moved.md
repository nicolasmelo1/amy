# The fold is told what moved

A workflow's `apply` is handed a record that has already been advanced:

```
plugins/serial-engine/src/Worker.ts:202
  this.deps.runtime.apply(applyPlan(record, decision, now), decision, outcomes, observation, now)
```

`applyPlan` sets `next.state = plan.to` before the workflow sees it. So inside
`apply`, `record.state` is the state being moved *to*, and the state the tick
started in is not passed at all — it survives only as the last entry
`applyPlan` pushed onto the history.

Nothing says so. The parameter is called `record`, it is the same type as the
record the plan was made from, and reading it as the state the work came *from*
is the obvious mistake. It is also silent: the comparison simply never matches,
so the branch never runs and no test that does not know to look will notice.

`@nicolasmelo1/workflow-revv` had it for months:

```ts
if (plan.kind === "advance" && plan.to === "ESCALATED" && record.state !== "ESCALATED") {
  next.resumeAt = record.state;
}
```

The guard was there to stop `resumeAt` being written as `"ESCALATED"`. Because
`record.state` was already `"ESCALATED"` on every advance to it, the condition
excluded *every escalation there is*. `resumeAt` was never written, and
`planEscalated` fell back to its default — so an answer sent the ticket back to
the beginning of its lifecycle instead of to where it stopped, and the work was
redone from `DISCOVERED` every time somebody replied.

`applyPlan` counts attempts the same way (`packages/core/src/work.ts:79`), and
the same confusion reaches them: a workflow that wants to know whether *this*
tick spent an attempt has to reason about a number that was incremented behind
it.

## What changes

`apply` receives the transition, not just its destination:

```ts
apply(record, plan, outcomes, observation, now, moved: { from: string; to: string } | null)
```

`null` for a plan that did not advance. The engine already has both halves; it
is withholding one.

The history stays the record of what happened. It stops being the only way to
find out what just did.

## Acceptance criteria

- [ ] `apply` receives the state the tick started in, for an advance
      (proof: test:plugins/serial-engine/tests/Worker.test.ts)
- [ ] It receives `null` for a plan that did not advance
      (proof: test:plugins/serial-engine/tests/Worker.test.ts)
- [ ] A workflow reading the transition folds a resume point correctly across
      an escalation raised from every state that can raise one
      (proof: assertion:escalating.remembers_the_state_it_interrupted)
- [ ] The shipped workflow folds nothing from `record.state`
      (proof: unspecified:the rule that refuses it ships with the guardrails plan and retires here)

**Exit condition:** a workflow can tell where a tick came from without reading
the history, and reading `record.state` in a fold is refused by a rule rather
than discovered by a ticket that went round its whole lifecycle on every reply.

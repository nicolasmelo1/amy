# The workflow contract changes once

Two defects reached a real board from the same seam, and both are fixed by
changing what a workflow package looks like. Doing that twice costs every
workflow author two migrations for one interface, so it is one row and one
release.

## An action can be declared and not exist

An action is declared three times, in three shapes, and the thing that validates
it is not the thing that runs it.

```ts
usesActions: ["hand-off-to-qa", ...]                                    // a string
registry.action("merge", { port: FORGE_PORT, method: "merge" }, forge)  // a port and a method
handlers: () => ({ "merge": async (action, ctx) => { ... } })           // a function
```

The loader checks the second. The engine reads only the third
(`plugins/serial-engine/src/Worker.ts:415`). So an action can be declared, pass
the mount, be planned by a real state, and have nothing behind it at the moment
it runs. `hand-off-to-qa` was exactly that in a private workflow for its whole
life: the core's table names `tracker.setStatus`, the tracker was mounted, the
loader was satisfied — and the last step of the happy path would have thrown the
first time any ticket reached it. It never had, so nobody knew.

That is not a bug a careful author avoids. It is a bug the API invites: three
declarations of one fact and no single place where they are compared.

**What changes.** One declaration.

```ts
actions: {
  "hand-off-to-qa": async (action, ctx) => { ... },
  "merge": { port: FORGE_PORT, method: "merge" },
}
```

The key is the declaration, the value is the implementation — a handler, or a
port and method the host wires. `usesActions` is derived from the keys, so the
two cannot disagree; a handler nobody declared and a declaration nobody
implemented both stop being expressible. The core's action table stays; what it
can no longer do is stand in for an implementation the engine will not reach.

## The fold is not told what moved

`apply` is handed a record that has already been advanced: the plan's
destination is written into `next.state` before the workflow sees it
(`plugins/serial-engine/src/Worker.ts:202`). So inside `apply`, `record.state`
is the state being moved *to*, and the state the tick started in is not passed
at all — it survives only as the last entry pushed onto the history.

Nothing says so. The parameter is called `record`, it is the same type as the
record the plan was made from, and reading it as the state the work came *from*
is the obvious mistake. It is also silent: the comparison never matches, the
branch never runs, and no test that does not know to look will notice.

A private workflow had it for months:

```ts
if (plan.kind === "advance" && plan.to === "ESCALATED" && record.state !== "ESCALATED") {
  next.resumeAt = record.state;
}
```

The guard existed to stop `resumeAt` being written as `"ESCALATED"`. Because
`record.state` was already `"ESCALATED"` on every advance to it, the condition
excluded *every escalation there is*. `resumeAt` was never written, so an answer
sent the ticket back to the beginning of its lifecycle instead of to where it
stopped, and the work was redone from the first state every time somebody
replied.

Attempts are counted the same way (`packages/core/src/work.ts:79`), and the same
confusion reaches them: a workflow that wants to know whether *this* tick spent
an attempt has to reason about a number incremented behind it.

**What changes.** `apply` receives the transition, not just its destination:

```ts
apply(record, plan, outcomes, observation, now, moved: { from: string; to: string } | null)
```

`null` for a plan that did not advance. The engine already has both halves; it is
withholding one. The history stays the record of what happened and stops being
the only way to find out what just did.

## Why one row

Both are breaking changes to the same interface, landing in the same release,
migrating the same two shipped workflows and the same scaffold. Split, the
second one asks every author who has already migrated to do it again for a
change they could have taken in the same sitting. The two halves are
independent to read and identical in blast radius, which is the case the
one-row rule is for.

## What shipped

**One declaration.** `WorkflowRuntime.handlers()` is gone and so is
`Workflow.usesActions`; the runtime carries `actions`, a map from each action
name to what runs it — an `ActionHandler`, or an `ActionSpec` (`{ port, method }`)
the host calls with the action and its context, whose answer lands in
`outcomes` under the action's name. The keys live on the runtime rather than on
the pure half because the value is the implementation, and the implementation
is the runtime's. The mount reads them through `mountedActions`, the docs
generator reads them from the contributed runtime, and nothing else lists them.
The three workflows' `USES_ACTIONS` constants are deleted; each map stays
exhaustive over its `Effect` union at compile time.

`unmetNeeds` asks of every key, at boot: is there a handler, or a port and a
method whose port is mounted and has that method? A handler still has to name
an action the catalogue knows — the catalogue is what tells the budget which
actions spend an agent and the tracker check which ones write — and a port and
a method may run an uncatalogued action but not send a catalogued one to a
different port. A package still on the old shape is named with its fix: a
workflow that still carries `usesActions`, or a runtime that still has
`handlers()`, is refused with the sentence that says what to change. So is a
workflow that contributed no runtime, which the engine used to find out on its
first tick.

The dispatch is one function, `runAction`, used by the serial engine, the
testkit's walk and the core's own tests, so "reachable by the engine's
dispatch" is the same code path everywhere it is claimed.

**The transition.** `apply` gains a sixth argument, `moved: { from, to } | null`,
computed by the core's `movedBy(record, plan)` before the record is advanced.
The engine, the testkit and `amy workflow check` all pass it.

**The resume point, in the shipped workflow that needed it.** `ticket-to-qa`
escalates from five states — `IMPLEMENTING`, `CHECKED`, `COPILOT_FIX`,
`REVIEWER_ASSIGNED` and `HUMAN_FIX` — and every answer used to send the work to
`HUMAN_FIX`, which is right for one of them. It now folds `resumeAt` from
`moved.from` on the way into `ESCALATED`, goes back there when the owner
answers, and forgets it on the way out. Leaving `ESCALATED` also starts every
attempt counter again: the owner's answer is new information, and a state that
gave up on its attempts would otherwise give up again on its first look back.
A record escalated before this release has no `resumeAt` and resumes where it
always did.

## Where this fell short of the plan

"A workflow whose plan emits an action it never declared is refused *at boot*"
cannot be met as written. `plan()` is a function, and what it will emit is not
knowable until it runs against a record and an observation; the mount has
neither. What shipped is the nearest honest thing: the engine checks every
action a plan carries *before the first of them runs*, so a plan with one
undeclared action does nothing at all rather than half of what it said, and
the testkit and `amy workflow check` report it before the workflow ships. The
map's `Effect`-typed exhaustiveness makes it a compile error in a TypeScript
workflow. The assertion keeps the plan's name and proves the refusal that
exists.

## Acceptance criteria

- [x] A workflow declaring an action with no implementation is refused at boot,
      naming the action
      (proof: assertion:mount.an_action_with_no_implementation_is_refused)
- [x] A workflow whose plan emits an action it never declared is refused before
      any of that plan's actions run — at the first plan that carries it, not at
      boot; see above
      (proof: assertion:mount.an_undeclared_action_is_refused)
- [x] Every declared action is reachable by the engine's dispatch, and a
      port-and-method declaration is wired without the workflow writing a handler
      (proof: test:packages/core/tests/mount.test.ts)
- [x] `apply` receives the state the tick started in for an advance, and `null`
      for a plan that did not advance
      (proof: test:plugins/serial-engine/tests/Worker.test.ts)
- [x] A workflow reading the transition folds a resume point correctly across an
      escalation raised from every state that can raise one
      (proof: assertion:escalating.remembers_the_state_it_interrupted, and
      test:packages/workflow-ticket-to-qa/tests/escalating.test.ts for all five)
- [x] Both shipped workflows drive a ticket end to end on the new shape, and
      neither folds anything from `record.state`
      (proof: test:.software-factory/evidence/ticket-to-qa-scenario.sh)

**Exit condition:** an action cannot be declared without being implemented and
the check that says so happens at boot rather than at the first tick that
reaches it, a workflow can tell where a tick came from without reading the
history, and both arrived in one release so no author migrated twice.

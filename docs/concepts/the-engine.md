---
title: The engine
description: What one tick does, in order, and why the engine knows nothing about tickets.
group: How it works
order: 7
---

# The engine

The engine advances **at most one piece of work by at most one move**, then
chains the next look. That is `amy tick`, and everything else is that in a loop.

## What one tick does

```text
1.  Is the handbrake pulled?              → stopped
2.  Recover items a dead worker left, and prune what is finished
3.  Claim the earliest due item            → nothing due? idle
4.  Load the record, or make a new one
5.  Ask the runtime to observe the world
6.  Ask the workflow to decide             → a Plan
7.  Would this move spend an agent, and is the budget spent?
                                           → parked, requeued with a delay
8.  Run the plan's actions, in order, through the runtime's handlers
9.  Fold: applyPlan for state/attempts/history, then the runtime's apply
10. Save the record
11. Queue the next look — immediately for `act`, after the delay for `wait`,
    not at all for `settled`
12. Complete the queue item
```

Steps 5, 6, 8 and 9 are the workflow's. Everything else is the engine's, and the
engine has no idea what any of them mean.

## Every noun in it

Queue, record, attempt, budget, stop switch. A ticket, a pull request and a
reviewer appear nowhere. That is not an aspiration — it is checkable, and it is
what makes a second workflow cost a package instead of a fork.

```ts
interface WorkerDeps {
  queue: Queue;
  records: Store;
  workflow: Workflow;       // the order things happen in
  runtime: WorkflowRuntime; // how they actually happen
  notifier: Notifier;       // core's own port, and the only one left here:
                            // a failure has to be sayable
  now: () => Date;
  config: WorkerConfig;
  log?: EventLog;           // optional, so an engine with no log still runs
  stop?: StopSwitch;        // optional, so an engine with no handbrake still runs
  budget?: Budget;          // optional, so an engine with no ceiling still runs
}
```

The three optionals are worth noticing. An engine mounted without a log, a
handbrake or a ceiling still runs. That is what lets a workflow be driven in a
test with almost nothing around it.

## What a tick returns

| Result | Means |
| :-- | :-- |
| `idle` | Nothing was due. Not the same as the queue being empty. |
| `worked` | One move happened: from, to, which kind of plan, and why. |
| `stopped` | The handbrake is on. |
| `parked` | The move would have spent an agent and the budget said not yet. The record is untouched. |
| `failed` | The attempt threw. Which attempt, and what it said. |

`amy status --json` and the event log both carry these, so whatever renders them
does not have to parse prose.

## It fails out loud

There is no graceful shutdown here. The GitHub API will go down and Claude will
go away, and when a dependency does:

- **one** warning on the way down,
- silence while it is down,
- **one** warning when it comes back,
- and the work resumes the move it was going to make, from the state it was in.

Which means the number that used to mean "how many failures before you are told"
now means "how many before the machine gives up", and being told happens on the
first one.

### The one rule about swallowing a failure

> **A port call may only be swallowed when its failure does not make the saved
> record a lie.**

The notifier and the event log are the only two that qualify. A notification
channel you misconfigured never costs a piece of work a move, and neither does a
log directory you cannot write to.

The tracker, the code host, the agent and the gate all still fail the tick,
because a record that says "the pull request is open" when it is not is worse
than a tick that failed.

The long-form argument is in
[`docs/design/the-engine-fails-out-loud.md`](https://github.com/nicolasmelo1/amy/blob/main/docs/design/the-engine-fails-out-loud.md).

## Serial, and replaceable

The shipped engine is serial: one move at a time, in one process. That is a
choice, not a limit of the design — `Engine` is a two-method port:

```ts
interface Engine {
  discover(): Promise<string[]>;
  tick(): Promise<unknown>;
}
```

A concurrent engine is a plugin. What it would have to keep is the atomic claim
(the file queue already provides it), the one-move-per-look rule, and the budget
check *before* the call rather than after.

The serial engine carries a gate, because it decides whether a piece of work
gets lost. See [The gate](../development/the-gate.md).

---
title: The engine
description: What one tick does, in order, how a look differs from a try, and why the engine knows nothing about tickets.
group: How it works
order: 9
---

# The engine

The engine moves **at most one piece of work by at most one move**, then
queues the next look at it. `amy tick` is one of those. `amy start` runs them
in a loop, discovering new work before every pass.

The engine is a port, `discover` and `tick`, so it can be replaced like any other:

```ts
import type { Engine } from "@amykit/core";

// The smallest engine there is: it finds nothing and never moves.
export const still: Engine = {
  discover: async () => [],
  tick: async () => ({ kind: "idle" }),
};
```

`@amykit/plugin-serial-engine` is the one that ships. The rest of this page is
what it does.

## Discovery

`discover()` asks the workflow's runtime what work it can find and queues each
piece that is not already waiting. It skips work whose record is in a terminal
state, and work the engine gave up on. A piece already queued keeps its look,
and only its priority is refreshed.

## What one tick does

```text
1.  Recover claims a dead worker left behind
2.  Claim the earliest due item               → nothing due: idle
3.  Load its record, or make a new one
4.  Ask the runtime to observe the world
5.  Ask the workflow to decide                → a Plan
6.  A settled plan completes the item, and nothing is queued after it
7.  Would an action reach the agent port?     → ask the budget and the
                                                evidence check: parked
8.  Run the plan's actions in order
9.  Fold: applyPlan for state, looks, attempts and history,
    then the runtime's own apply. Save the record
10. Queue the next look, complete this item, prune finished ones
```

Steps 4, 5, 8 and the runtime's half of 9 belong to the workflow. The engine
does not know what any of them mean. Its own nouns are queue, record, look,
attempt, budget and log. A ticket, a pull request and a reviewer appear
nowhere in it, which is why a new workflow is a package and the engine stays
as it is.

Before step 8 runs anything, the whole plan is checked against the actions
the workflow declared. A plan carrying an undeclared action fails with
nothing half done. The handbrake belongs to the host: the loop does not tick
while it is pulled, and `amy stop --all` ends the agent processes already
running.

## Plans, looks and attempts

A decision returns a plan:

| Plan | What happens next |
| :-- | :-- |
| `act` | Run the effects, stay in the state, look again straight away. |
| `advance` | Run the effects, move to `to`, look again straight away. |
| `wait` | Run the effects (often none), stay, look again after `retryAfterMs`. |
| `settled` | Nothing. The item leaves the queue. |

`applyPlan` keeps a pair of counters per state. **Looks** count every `act` and
`wait`. **Attempts** count only an `act` that was a real try. A `wait` is never
a try, an `act` marked `{ attempt: false }` is not one, and neither is an `act`
whose action returned `{ notATry: true }`. A ceiling written against
`attemptsIn` then counts agent runs that failed, and a first-look message
written against `looksIn` fires once, however long the work waited. Why:
[waiting is not trying](../design/waiting-is-not-trying.md).

```ts
import { applyPlan, attemptsIn, looksIn, type WorkRecord } from "@amykit/core";

declare const record: WorkRecord; // in IMPLEMENTING, never looked at
const now = new Date();

// Held for the checkout: a look, and no attempt.
const held = applyPlan(record, { kind: "wait", retryAfterMs: 60_000, why: "the checkout is in use", effects: [] }, now);

// Preparing the branch before the try: a look, and no attempt.
const prepared = applyPlan(held, { kind: "act", attempt: false, why: "prepare the branch", effects: [{ type: "prepare-branch" }] }, now);

// The try itself.
const tried = applyPlan(prepared, { kind: "act", why: "write the change", effects: [{ type: "implement" }] }, now);

console.log(looksIn(tried, "IMPLEMENTING"), attemptsIn(tried, "IMPLEMENTING")); // 3 1
```

An action whose outcome is `{ notATry: true, retryAfterMs }` also sets the
delay before the next look. That is how an agent cut off by a usage limit
waits for the limit to reset without spending a try. Why:
[a usage limit is not an attempt](../design/a-usage-limit-is-not-an-attempt.md).

## What a tick returns

| Result | Means |
| :-- | :-- |
| `idle` | Nothing was due. That is different from the queue being empty. |
| `worked` | One move: from, to, which plan, why, and when it looks again. |
| `stopped` | The handbrake is on. |
| `parked` | The move would have spent an agent and the budget or the evidence check said not yet. The record is untouched. |
| `failed` | The look threw, which attempt of the item it was, and what it said. |

Each result is also a line in the [event log](events.md).

## Parked before the call

Only a move that would reach the `agent` port is asked anything. The engine
reads that from the action's declared port, never from what the action means.
Either of these can park it:

- **The budget**, when one is mounted. See [Budgets](budgets.md).
- **The evidence check**, when the workflow's runtime declares a progress
  policy. Agent runs that keep reporting nothing new in a state stop being
  started, and `progress.parked` says why. Why:
  [no retry is free](../design/no-retry-is-free.md).

A parked item goes back on the queue with a delay. Its record keeps its state
and its counters, and the same move is tried when there is room.

## It fails out loud

GitHub will go down and an agent's provider will have an outage. When a
dependency fails under a piece of work:

- **one** warning on the first failure, and `work.degraded` in the log,
- silence on the failures after it,
- **one** warning when the work moves again, and `work.recovered`,
- and the work resumes the move it was making, from the state it was in.

Past `maxItemAttempts` the engine gives up: it says so once, marks the record,
and drops the item. Discovery does not bring that work back. `amy look <id>`
does, and is the only thing that does.

### Which failures may be swallowed

> **A port call may be swallowed only when its failure does not make the saved
> record a lie.**

The notifier and the event log qualify. A broken notification channel or an
unwritable log never costs a piece of work a move. The tracker, the code host,
the agent and the gate all fail the tick, because a record saying "the pull
request is open" when it is not is worse than a tick that failed. The argument
is in [the engine fails out loud](../design/the-engine-fails-out-loud.md).

## Serial, or lanes at once

The serial engine makes one move per look. When a record waits at a fork, it
moves one lane per look, taking them in turn, so a lane the budget refuses
never holds its siblings up.

`@amykit/plugin-concurrent-engine` is the same engine with the lanes moved
side by side. It claims one item as the serial engine does, moves every lane
that has a move, asks the budget before each lane's call, and folds the moves
into the record it claimed. Name it in a profile's plugins instead of the
serial engine; a workflow without a fork runs on it unchanged. See
[a workflow runs on lanes](../design/a-workflow-runs-on-lanes.md).

The serial engine carries a gate, because it decides whether a piece of work
gets lost. See [The gate](../development/the-gate.md).

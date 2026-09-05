---
title: Budgets and ceilings
description: Two currencies, read from the log rather than a tally, and asked before the call.
group: How it works
order: 9
---

# Budgets and ceilings

An overnight run spends two things that are not yours to spend: **quota**, and
**your colleagues' attention**. There is a ceiling on each, and they work
differently on purpose.

## The agent budget

```yaml
agent:
  budget:
    perFiveHours: { tokens: 2000000, costUsd: 20 }
    perWeek:      { tokens: 30000000, costUsd: 150 }
    stopAt: 0.9
```

Two windows, each with a ceiling in tokens, in dollars, or both. The first one
to blow parks the work.

**Two currencies, because they are different currencies.** Tokens are what a
subscription meters and what refuses at three in the morning. Dollars are what
an API key costs. A run whose cost nobody reported moves the token ceiling and
leaves the dollar one alone — adding up a figure nobody measured would invent
the number that decides when to stop.

`stopAt` is the fraction at which *new* work stops being started. At `0.9`, the
last tenth of the window is reserved for finishing what is already in flight.

### Read from the log, never from a tally of its own

The budget aggregates `agent.run` events. It keeps no counter.

A counter is a second source of truth, and the day it disagrees with the log is
the day nobody can tell which is right. Reading the log means `amy budget`, the
relay and any report all answer from the same place, and a log copied to another
machine answers the same way.

```sh
amy budget
```

### Asked before the call, not after

A ceiling checked afterwards is a report, not a brake.

It is asked **only for a move that would actually spend an agent** — the engine
asks whether the action dispatches to the `agent` port, without learning what
the action means:

```ts
dispatchesTo(action, "agent")
```

Past the fraction, the engine starts nothing new and puts the work back on the
queue with a delay. **The work is parked, not lost**: the record is untouched
and the same move happens when the window has room.

### It only mounts when it can refuse

The relay mounts the budget port **only when a ceiling is actually configured**.
A budget that can never refuse is a port pretending to be one.

And a ceiling set with no event log to measure it against is a refusal at boot:

```
@amykit/plugin-agent-relay: `budget` sets a ceiling, and the host mounted no
event log to measure the spending against
```

## The reviewer ceiling

```yaml
policy:
  maxOpenReviewsPerReviewer: 2
```

The other currency. Past it, the pull request **stays open with nobody
assigned** and the work waits.

Notice what that does *not* do: it does not stop the work. Everything up to the
review keeps moving; only the queue of human review respects the patience of the
people in it.

Review load is counted **across every configured repository**. Counting one
would send every review to whoever happens to be quiet in that one.

## The errand ceiling

```yaml
errands:
  policy:
    maxInFlight: 3
```

`amy btw` is meant to cost nothing to say. The failure that follows from that is
a pile of open draft pull requests nobody asked to review — so the errand
workflow holds new work **before an agent is spent**, not before the pull
request is opened, and says so once:

> I am holding an errand: 3 of mine are already in flight and nobody has looked
> at them. Land one and I will pick this up.

## What a model costs

```sh
amy models show        # the price table in force
amy models refresh     # take the base rates from models.dev
```

The table is vendored and hash-locked, so a price nobody reviewed cannot change
what the machine believes it spent. `refresh` takes the base rates from
models.dev and **keeps whatever it does not carry**, so a local override
survives an update. `--dry-run` says what would change and writes nothing.

## Reading it back

Every agent call writes `agent.run` with the harness, the model, the tokens and
the cost where one was reported. Every park writes `budget.parked` with which
window, which measure, how much was used, and how long until there is room.

See [Events](events.md).

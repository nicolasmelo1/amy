---
title: Budgets and ceilings
description: What the agents may spend, read from the event log and asked before the call, and the ceilings that ration people's attention.
group: How it works
order: 11
---

# Budgets and ceilings

A run left going overnight spends quota that is yours and attention that
belongs to the people who review its work. amy has a ceiling for each, and
they work differently.

## The agent budget

```yaml
agent:
  budget:
    perFiveHours: { tokens: 2000000, costUsd: 20 }
    perWeek:      { tokens: 30000000, costUsd: 150 }
    stopAt: 0.9
```

The windows are fixed, because they are the ones a subscription meters: the
rolling session window (`perFiveHours`) and the week. What you set is the ceiling in each, in
tokens, in dollars, or both. The first ceiling past its `stopAt` parks the
work. Leave the block out and there is no ceiling.

Tokens and dollars are kept apart because they measure different things.
Tokens are what a subscription meters. Dollars are what an API key costs. A
run whose cost nobody knows moves the token ceiling and leaves the dollar one
alone; adding a figure nobody measured would invent the number that decides
when to stop. A dollar ceiling over a ladder that nothing can price is refused
at boot for the same reason.

`stopAt` is the fraction of a ceiling at which new work stops being started.
At `0.9`, the last tenth of the window is kept for work already in flight.

### Read from the log

The budget keeps no counter. Each time it is asked, it adds up the `agent.run`
lines in the [event log](events.md) over the window. A counter would be a
second record of the same spending, and the day the two disagreed nobody
could say which was right. Because the log is the only source, `amy budget`,
the relay and a log copied to another machine all give the same answer.

```sh
amy budget
```

`amy budget` first shows each subscription's own usage windows, as its harness
reports them, then the ledger against your ceilings.

### Asked before the call

A ceiling checked after the call is a report. This one is checked before.

The engine asks only when a move would reach the `agent` port, which it reads
from each action's declared port without learning what the action does. Past
`stopAt` it starts nothing new and puts the item back on the queue until the
window has room. The record keeps its state and its attempts, and the same
move happens later. `budget.parked` says which window, which measure, how much
was used and how long until there is room. See
[The engine](the-engine.md#parked-before-the-call).

### Mounted only when it can refuse

`@amykit/plugin-agent-relay` mounts the `budget` port only when a ceiling is
set; a budget that can never refuse would only look like a brake. A ceiling
with no event log to measure against is refused at boot:

```text
`budget` sets a ceiling, and the host mounted no event log to measure the spending against
```

The chat's own agent runs are not charged unless `chat.budget` is on.

## Runs that add nothing

A retry costs as much whether it brings a fix or the same answer again. A
workflow can opt into a ceiling on that:

```yaml
agent:
  budget:
    progress: { maxUnchanged: 2, handoff: park }
```

Its actions then report whether a run moved things on. Once a state has had
`maxUnchanged` agent runs in a row that added no evidence, the engine parks
the next one and logs `progress.parked`, naming what stayed the same. The
shipped ticket workflow reads this block. Why:
[no retry is free](../design/no-retry-is-free.md).

## The reviewer ceiling

```yaml
plugins:
  "@amykit/workflow-ticket-to-qa":
    policy:
      maxOpenReviewsPerReviewer: 2
```

This one rations people. The least-loaded reviewer on the roster is chosen,
and if even they are at the ceiling, the pull request **stays open with nobody
assigned** and the work waits. Everything before review keeps moving; only the
requests landing on people are held. Load is counted across every repository
the team works in, since counting one would send every review to whoever is
quiet there.

## The errand ceiling

```yaml
plugins:
  "@amykit/workflow-errand":
    policy:
      maxInFlight: 3
```

`amy btw` costs nothing to say, and that is the risk: a pile of draft pull
requests nobody asked to review. The errand workflow holds new work **before
an agent is spent**, and says so once:

> I am holding an errand: 3 of mine are already in flight and nobody has looked
> at them. Land one and I will pick this up.

## What a model costs

```sh
amy models show        # the price table in force
amy models refresh     # take the base rates from models.dev
```

Both come with the relay. The table is vendored and hash-locked, so a price
nobody reviewed cannot change what the machine believes it spent. `refresh`
takes the base rates from models.dev and keeps what models.dev does not carry,
such as long-context tiering, so a local override survives. `--dry-run` says
what would change and writes nothing. `amy start` refreshes a table older than
a week before the loop spends anything.

## Reading it back

Every agent call writes `agent.run` with the harness, the model, the tokens,
and the cost with where that figure came from: reported by the harness,
computed from the table, included in a subscription, or unknown. See
[Events](events.md).

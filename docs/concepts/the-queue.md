---
title: The queue
description: Why amy has no schedule, how a claim is a rename, and which counter says the machine is failing.
group: How it works
order: 8
---

# The queue

**The queue is the schedule.** amy runs nothing on an interval.

Every look at a piece of work queues the next one. A step that takes a minute
and a step that takes an hour both queue their successor the moment they
finish, so nothing waits for a timer to come round.

A delay appears in one place only: a `wait` plan says how long until the next
look, in the workflow's own policy. An action can name a delay too, when it
reports that it did not try (see [The engine](the-engine.md#plans-looks-and-attempts)).
Nothing global sets either.

## What `--every` is

```sh
amy start --every 60
```

How long the loop sleeps **after a pass that found nothing due**. It is not
how often work happens. A queue with something due is drained as fast as the
moves complete, and the chat is still read while the loop sleeps.

## One file per item

`@amykit/plugin-file-queue` keeps each profile's queue in its own directory:

```text
~/.amy/<profile>/queue/
├── ready/
│   └── 1730000000000-abc123.json   waiting until it is due
├── running/
│   └── 1729999000000-def456.json   claimed by a worker right now
└── done/
    └── 1729990000000-ghi789.json   finished, kept until its retention ends
```

**A claim is a rename** from `ready/` into `running/`. A rename is atomic on
one filesystem, so a second worker cannot take an item the first one already
has. There is no lock to release if a process dies. A lock held by a dead
process stops the queue; a file left in `running/` is one item to recover,
and the rest keeps moving.

Due items are taken in the order they became due. With `order: priority` the
most urgent due item goes first, using the priority discovery reported, and
the order they became due breaks a tie.

## Bringing a look forward

`amy look <id>` brings the look already queued for that work forward to now.
It never adds a second one beside it: a second item for the same work would
queue its own successor, and the chain would fork into a pair that both spend
an agent. A look that is
already due is left alone. `amy look` is also how work the engine gave up on
comes back.

## Recovery and pruning

```sh
amy queue recover      # return items a dead worker left in running/
amy queue prune        # delete finished items past their retention
```

The engine recovers on every tick and prunes as it completes items. A claim
older than `staleClaimMs` counts as abandoned and goes back to `ready/`. A finished item
is kept for `retentionDays`, so it can still be read beside the log, then
pruned. Neither ever touches unfinished work.

## What the queue promises

The file queue carries a gate: promises proven against the built plugin,
loaded from another process.

| Assertion | What it rules out |
| :-- | :-- |
| `claims_what_was_enqueued` | An item that goes in and never comes out |
| `refuses_a_second_claim` | A second worker making the same move |
| `holds_an_item_until_it_is_due` | A backoff that does not back off |
| `brings_a_held_look_forward` | `amy look` waiting anyway |
| `promoting_leaves_one_look` | A look brought forward that forks the chain in two |
| `promoted_look_is_ordered_by_its_new_time` | A look brought forward and still taken last |
| `recovers_what_a_dead_worker_left` | Work lost to a crash |
| `never_prunes_unfinished_work` | Work deleted by tidying |
| `survives_a_restart` | A queue that only existed in memory |

Changing the plugin's source expires that proof, and the gate stays red until
the scenario runs again. See [The gate](../development/the-gate.md).

## Which counter is which

Each queue item carries its own `attempt`: how many times in a row this look
threw. Past `maxItemAttempts` the engine gives up on the work, says so once,
and drops the item. That counter bounds **the machine failing**.

The record keeps its own counters per state: looks, and attempts that were
real tries. Those bound **a step not working**, and the workflow writes its
ceilings against them. A park keeps the item's counter as it was, because
waiting for the budget is neither kind of failure.

## Replacing it

`Queue` is a port. A queue in SQLite, Redis or a broker is a plugin that
registers one with `registry.queue(...)`. Its methods are listed in
[Reference → Contracts](../reference/contracts.md#queue), and the assertions
above are the test suite worth copying.

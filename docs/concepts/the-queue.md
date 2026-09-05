---
title: The queue
description: Why there is no interval anywhere, and how two workers cannot take the same item.
group: How it works
order: 6
---

# The queue

**The queue is the schedule.** There is no interval anywhere in amy.

A piece of work's next look is enqueued by the look that precedes it. A step that
takes a minute and a step that takes an hour both chain the instant they finish,
rather than waiting for a tick that might be twenty minutes away.

Waiting states enqueue themselves with a delay, which is the only place a
duration appears at all — and it comes from the workflow's own policy, in its own
vocabulary, not from a global setting.

## What `--every` actually is

```sh
amy start --every 60
```

How long the loop sleeps **after finding nothing to do**. It is not how often
work happens. A queue with something due is drained as fast as the moves
complete.

## One file per item

```text
~/.amy/<profile>/queue/
├── 1730000000000-abc123.json      due, waiting to be claimed
├── running/
│   └── 1729999000000-def456.json  claimed by a worker right now
└── done/
    └── 1729990000000-ghi789.json  finished, pruned past its retention
```

**Claiming is a rename**, and rename is atomic on one filesystem, so two workers
cannot take the same item. There is no lock, and nothing to release if a process
dies.

That last part is the reason for the design rather than a side effect. A lock
held by a dead process is a queue that has stopped; a file left in `running/` is
a queue that keeps going and has one item to recover.

## Recovery and pruning

```sh
amy queue recover      # return items abandoned by a dead worker
amy queue prune        # delete finished items past their retention
```

An item in `running/` older than `staleClaimMs` is treated as abandoned and put
back. Finished items are pruned on the way past so the directory does not grow
forever; the retention exists because a finished item is still useful for
reading the log afterwards.

Neither of those ever touches unfinished work. There is a gate assertion for
exactly that — `queue.never_prunes_unfinished_work` — because the failure it
guards against is silent and permanent.

## What the queue promises

The file-queue plugin carries a gate, and the gate is a list of promises proven
against the built artifact from another process:

| Assertion | What it rules out |
| :-- | :-- |
| `claims_what_was_enqueued` | The obvious one |
| `refuses_a_second_claim` | Two workers doing the same move twice |
| `holds_an_item_until_it_is_due` | A backoff that does not back off |
| `recovers_what_a_dead_worker_left` | Work lost to a crash |
| `never_prunes_unfinished_work` | Work deleted by tidying |
| `survives_a_restart` | A queue that only exists in memory |

Changing the plugin's source expires that proof, and the gate goes red until the
scenario runs again. See [The gate](../development/the-gate.md).

## Attempts and giving up

Each queue item carries an attempt count. Past `maxItemAttempts` the machine
gives up on it: an announcement goes out, `work.failed` is logged, and in a
profile that takes notes the friction becomes a note — so the thing that broke
becomes the thing that gets fixed.

That is a different counter from the workflow's own per-state attempts, which
`applyPlan` keeps in the record. The item counter bounds *the machine failing*;
the state counter bounds *a step not working*.

## Replacing it

`Queue` is a port like any other. A queue backed by SQLite, Redis or a real
broker is a plugin:

```ts
registry.queue(new RedisQueue(ctx.config.url as string));
```

Eight methods, listed in [Reference → Contracts](../reference/contracts.md#queue). If
you write one, the six assertions above are the test suite worth stealing.

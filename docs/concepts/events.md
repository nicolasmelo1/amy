---
title: Events
description: One append-only log, a versioned contract, and why it is hash-locked.
group: How it works
order: 10
---

# Events

Everything that happens is one line in one file:

```text
~/.amy/events.jsonl
```

Append-only, one source, several readers: `amy budget` aggregates it, a harness
reads it to know what a run cost, a reporter projects it. Giving each of those
its own state is how they end up disagreeing with each other.

```jsonl
{"at":"2026-09-05T09:14:02.114Z","kind":"run.claimed","workId":"NW-412","build":"0.1.0+83ef192","detail":{"reason":"found by the workflow"}}
{"at":"2026-09-05T09:14:02.130Z","kind":"work.planned","workId":"NW-412","state":"READY","build":"0.1.0+83ef192","detail":{"plan":"advance","why":"the ticket is unambiguous"}}
```

## Every line names the build that wrote it

Set by the log, not by callers — a field every caller has to remember is a field
that goes missing. Without it, "we improved this" and "what failed yesterday"
stop being comparable, and a report that aggregates several builds into one
number is worse than no report.

An install built from a tree with uncommitted work in it stamps `dev`, because
that is the truth.

## The kinds

<!-- amy:generated event-kinds -->

| Kind | Written when | Always carries |
| :-- | :-- | :-- |
| `action.failed` | One action threw, and what it said. | `workId` |
| `action.finished` | One action finished without throwing. | `workId` |
| `action.started` | One action began. | `workId` |
| `agent.handoff` | An agent was handed over to another one, and which axis moved. | `workId` |
| `agent.run` | An agent ran: which harness, which model, what it cost. | `workId`, `state` |
| `budget.parked` | Work was parked because a budget window is nearly spent. | `workId`, `state` |
| `notify.failed` | An announcement could not be delivered, and what it said. | `workId`, `state` |
| `run.claimed` | The engine took an item off the queue, and why it was there. | `workId` |
| `run.idle` | Nothing was due, so the engine did nothing. | _nothing beyond `at` and `kind`_ |
| `stop.enforced` | The engine obeyed the handbrake, and what it did not start. | _nothing beyond `at` and `kind`_ |
| `stop.requested` | The operator pulled the handbrake. | _nothing beyond `at` and `kind`_ |
| `work.advanced` | The work moved to another state. | `workId`, `state` |
| `work.degraded` | This work started failing, and the engine is still retrying underneath. | `workId`, `state` |
| `work.failed` | One attempt at this work threw, and which attempt it was. | `workId`, `state` |
| `work.planned` | A workflow decided what to do next, and said why. | `workId`, `state` |
| `work.recovered` | This work is moving again, after however many attempts had failed. | `workId`, `state` |
| `work.settled` | The work reached a terminal state and left the queue. | `workId`, `state` |
| `work.waiting` | The work stayed where it was, to be looked at again later. | `workId`, `state` |

<!-- amy:end event-kinds -->

The shape of each `detail` is in [Reference → Events](../reference/events.md).

## It is a contract, and it is enforced twice

**By the compiler.** `EVENT_KINDS` is a `Record<EventKind, string>`, which welds
the two directions: dropping a member of the union leaves a key with nowhere to
go, and adding one leaves the table missing a property. Neither compiles, so the
names cannot drift.

**By a validator.** `packages/core/events.json` declares every kind, what each
line always carries, and the shape of its `detail`. A validator compares the
declaration against what is actually written.

**And the file is hash-locked.** Renaming a kind cannot happen without a
reviewer seeing the diff:

```yaml
L2.GENERATED_FILES_ARE_LOCKED:
  options:
    scope:
      - "packages/core/events.json"
```

Four harnesses, a budget ledger and a reporter read this log, so the kinds and
the shape of each `detail` are a contract rather than an internal detail.

## Reading a log written by a newer build

`isEventKind` is used when **reading**, never when appending. A log written by a
newer amy may carry kinds this one has never heard of, and the honest thing for
an aggregate to do with a line it cannot read is leave it out — not crash, and
not guess.

## The log is local, and may name real work

It records ticket identifiers, repositories and logins, because the operator's
own view should not be crippled to protect a report. Anything leaving the
machine is projected and scrubbed **at that boundary**, never here.

If you ship amy's log anywhere, that projection is yours to write. See
[Security](../start/security.md).

## Failing to log never costs a move

The event log is one of exactly two ports whose failure is swallowed — the other
is the notifier. A log directory you cannot write to does not cost a piece of
work a move, because a missing log line does not make the saved record a lie.

Everything else — tracker, code host, agent, gate — fails the tick. See
[The engine](the-engine.md#it-fails-out-loud).

## Adding a kind

1. Add it to the `EventKind` union and to `EVENT_KINDS`. The compiler will make
   you do both.
2. Declare it in `packages/core/events.json`: what it says, what it always
   carries, and the shape of its `detail`.
3. Re-lock the file, so the diff is seen.

A kind is worth adding when something reads it. A line nobody reads is noise in
a file whose value is that everything in it matters.

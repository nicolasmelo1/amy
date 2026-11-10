---
title: Events
description: The append-only log every part of amy writes to and reads from, and how its kinds are held to a contract.
group: How it works
order: 12
---

# Events

Everything amy does is a line in the event log. The log is a directory of
JSON Lines files, one per day:

```text
~/.amy/log/2026-11-10.jsonl
```

Every profile on the machine writes to the same log, so one log measures one
budget. A project keeps its own beside its state.

```jsonl
{"at":"2026-11-10T09:14:02.114Z","kind":"run.claimed","workId":"NW-412","build":"0.7.0+83ef192","detail":{"reason":"found by the workflow"}}
{"at":"2026-11-10T09:14:02.130Z","kind":"work.planned","workId":"NW-412","state":"READY","build":"0.7.0+83ef192","detail":{"plan":"advance","why":"the ticket is unambiguous"}}
```

The log is the only record of what happened. `amy budget` adds up what the
agents spent from it, and the budget the relay mounts reads it before every
agent starts. Each keeping a tally of its own would give answers that
disagree.

## Every line names the build that wrote it

The log stamps `build` on each line, so no caller has to remember to. Without
it, a report could not tell yesterday's failures from today's fix. A checkout
stamps `dev`. A release stamp is refused for a tree with uncommitted changes,
because that version would describe no commit.

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
| `progress.parked` | Work was parked because another agent run would add no evidence. | `workId`, `state` |
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
| `workflow.undrawn_transition` | The work moved between two states the workflow's diagram does not connect. The move was applied. | `workId`, `state` |
| `worktree.removed` | A worktree was removed, and why it was safe to remove. | _nothing beyond `at` and `kind`_ |
| `worktree.retained` | A worktree removal was refused, and why it was held. | _nothing beyond `at` and `kind`_ |

<!-- amy:end event-kinds -->

The shape of each `detail` is in [Reference → Events](../reference/events.md).

## The kinds are a contract

The budget, `amy budget` and any report you write all read this log, so a
renamed kind breaks readers you cannot see. The contract is held by the
compiler, a declaration and a lock.

**The compiler.** `EVENT_KINDS` is a `Record<EventKind, string>`. Drop a member
of the union and the table has a key with no kind; add one and the table is
missing a property. Neither compiles.

**The declaration.** `packages/core/events.json` declares every kind, the
fields its line always carries and the shape of its `detail`. `checkEvent`
compares a line against it.

**The lock.** `events.json` is hash-locked by the factory, so a change to it
cannot land without a reviewer seeing the diff:

```yaml
L2.GENERATED_FILES_ARE_LOCKED:
  options:
    scope:
      - "packages/core/events.json"
```

## Reading it

A reader takes a window with `read(since)`, or follows the log as it grows
with `watchEvents`. A log that can watch its own directory calls back on every
line; one that cannot is read again on a timer, and the caller is told so.
Why: [the event log can be watched](../design/the-event-log-can-be-watched.md).

```ts
import { isEventKind, watchEvents, type Event, type EventLog } from "@amykit/core";

declare const log: EventLog;

// What the agents ran in the last five hours, the window a subscription meters.
const since = new Date(Date.now() - 5 * 60 * 60 * 1000);
const runs = log.read(since).filter((event) => event.kind === "agent.run");
console.log(`${runs.length} agent runs`);

// Every move from now on, written by whichever process is driving the work.
const stop = watchEvents(log, new Date(), (event: Event) => {
  if (event.kind === "work.advanced") console.log(event.workId, "is now in", event.state);
});
stop();

// A line from a newer amy may carry a kind this build has never heard of.
export function known(line: string): Event | undefined {
  const parsed = JSON.parse(line) as { kind?: unknown };
  return typeof parsed.kind === "string" && isEventKind(parsed.kind) ? (parsed as Event) : undefined;
}
```

`isEventKind` is for reading and never for appending. A log copied from a
newer build can hold kinds this one does not know, and an aggregate should
leave such a line out. Guessing what it meant, or crashing on it, would both
be worse.

## The log is local, and names real work

Lines carry ticket keys, repositories and logins, because the operator's own
view should not be cut down to protect a report. Anything that leaves the
machine is projected and scrubbed where it leaves. If you ship the log
anywhere, that projection is yours to write. See
[Security](../start/security.md).

## Failing to write a line never costs a move

The engine swallows a failed append. A full disk under `~/.amy/log` does not
make the saved record wrong, so the work moves on and amy says once, on
stderr, that it is carrying on without a log. The notifier is the only other
port treated this way; every other failure fails the tick. See
[The engine](the-engine.md#it-fails-out-loud) and
[the engine fails out loud](../design/the-engine-fails-out-loud.md).

## Adding a kind

1. Add it to the `EventKind` union and to `EVENT_KINDS`. The compiler asks
   for both.
2. Declare it in `packages/core/events.json`: what it means, what its line
   always carries, and the shape of its `detail`.
3. Re-lock the file, so the diff is reviewed.

Add a kind when something will read it. The log is useful because every line
in it means something to some reader.

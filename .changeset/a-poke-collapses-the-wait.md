---
"@amykit/core": minor
---

A poke collapses the wait, so anything that hears an event can push.

The queue was already the schedule: a step that takes half an hour is one look
that takes half an hour, and the look after it is queued the moment it
finishes. Nothing polls while work is happening. What did wait on a clock was
the other half — a state holding for somebody else to move, looking again
every five minutes.

```sh
amy poke PROJ-1239
```

The look that already exists moves to now. Not a second look beside it, which
is the whole design of `Queue.promote`: two items for one piece of work would
each chain their own successor, and the queue would fork into two chains that
both spend an agent.

Three answers, and each is a different reason to do nothing more. Work being
worked on is left alone — the running step queues its own successor. Work held
back moves. Work nothing knows about is queued, which is what turns any webhook
into a push without this growing an endpoint: whatever already hears the event
runs the command.

Poking work that has settled costs one look and no agent. The decision function
answers `settled` and the engine completes it without chaining anything, so
nothing has to load a record to find out first.

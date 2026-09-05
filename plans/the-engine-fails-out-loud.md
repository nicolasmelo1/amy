# The engine fails out loud

The system will fail. The GitHub API will go down, Claude will go away. There
is no graceful shutdown here: it fails, it says so, and it carries on.

`@amykit/plugin-serial-engine` is the last large package without a gate, and it
is the one that decides whether a ticket gets lost. The argument is the same
one [the relay's plan](the-relay-is-proven-end-to-end.md) makes for itself:
the paths this exists to cover are paths a good day never reaches. No unit
test reaches a real `mount()`, a fan-out with a channel that genuinely
throws, or `plugin-github` against a `gh` that is not answering — and what
actually breaks is file state **between ticks**, which is to say between
processes.

## One warning down, silence in the middle, one back

`recordFailure()` was the only reader of `maxItemAttempts`, and it only spoke
once the ceiling was reached. You found out on the fifth attempt. The middle
attempts were silent, and coming back said nothing at all.

The signal is `QueueItem.attempt`: durable as one JSON file per item, already
crossing processes, already meaning "consecutive failures of this work", and
already zeroed by the event that means recovery. A field on the work record
would go through `applyTicketPlan`, which is the workflow's pure function and
would discard it — an engine writing into the workflow's record is the
layering this repo exists to prevent. Reading the log back is out because
`log` is optional and the contract of a warning cannot vary by install. A
counter on the `Worker` is out because `amy tick` is a fresh process each
time.

The ceiling wins over the fall, so `maxItemAttempts: 1` gives one warning
rather than two.

## Where exactly the isolation line is drawn

> **A port call may only be swallowed when its failure does not make the
> saved record a lie.**

`advance()` computes `next = applyTicketPlan(...)` and saves it. Afterwards
the record and the world have to agree. So:

| Port | Decision | Why |
| :-- | :-- | :-- |
| `tracker` | fails the tick | swallowing `setStatus` leaves the record at HANDED_OFF with the ticket still In Progress, and because the state moved nobody retries |
| `code-host` | fails the tick | swallowing `openPullRequest` leaves the record claiming a pull request with `pullRequestNumber: undefined` |
| `agent`, `gate` | fails the tick | their result *is* the outcomes, which is what `refuseAnIncompleteRun()` already exists to protect |
| `notifier` | isolated | nothing downstream reads it |
| event log | isolated | nothing downstream reads it *within the tick* |

The phrase this work started from — "a plugin that dies does not bring the
tick down" — is wider than the criterion below it. The narrow rule is written
here so the wide phrase is never quoted as a licence, and there is
deliberately no generic `isolated(port, fn)` helper: the moment one exists
somebody wraps `setStatus` in it, and "would this make the record a lie" is
not a question a helper can answer.

## Acceptance criteria

- [x] A dependency that goes down produces exactly one warning, naming the
      ticket and the failure
      (proof: assertion:engine.warns_once_on_the_first_failure)
- [x] The attempts while it is still down say nothing, across separate
      processes
      (proof: assertion:engine.stays_quiet_on_the_middle_attempts)
- [x] Coming back produces exactly one warning, saying how many attempts had
      failed
      (proof: assertion:engine.warns_once_when_it_recovers)
- [x] The ticket resumes the move it was going to make, from the state it was
      in
      (proof: assertion:engine.carries_on_from_where_it_was)
- [x] A budget park carries the retry budget the failures already spent, so
      the next tick does not read it as a recovery
      (proof: assertion:engine.keeps_the_attempt_count_across_a_park)
- [x] The ceiling says so once and takes the ticket off the queue, even when
      the announcement itself cannot be delivered
      (proof: assertion:engine.announces_once_at_the_ceiling)
- [x] A notification channel that throws does not stop the tick finishing or
      the record moving
      (proof: assertion:engine.finishes_the_tick_when_a_channel_throws)
- [x] What could not be delivered is written down, with the ticket and the
      text
      (proof: assertion:engine.records_the_notification_it_could_not_send)
- [x] Every channel throwing is still not a reason for a ticket to stop
      moving
      (proof: assertion:engine.finishes_the_tick_when_every_channel_throws)
- [x] A log directory that cannot be written to costs no ticket a move, and
      complains once rather than once per line
      (proof: assertion:engine.finishes_the_tick_when_the_log_cannot_be_written)
- [x] Every line the run actually wrote keeps the declared event contract
      (proof: assertion:engine.every_line_matches_the_contract)

**Exit condition:** the gate carries a sealed manifest whose report shows
these assertions passing against the built artifacts, and touching the engine
or the fan-out turns `sf check` red until the run is repeated and resealed.

## The log as a versioned contract, which is proved by a rule

The third part of this work is not an acceptance criterion above, because it
is not proved by a scenario assertion. It is proved by a rule.

`packages/core/events.json` declares every kind: what the line says, which
top-level fields it cannot be written without, and the shape of its `detail`.
`checkEvent` compares a line against it, `RecordingEventLog` throws on a
violation — which turns every test that already drives the engine into a
conformance test — and the scenario checks every line that reached the disk.

The file is in the `L2.GENERATED_FILES_ARE_LOCKED` scope, so renaming a kind
turns `npm run gate` red until `sf lock` runs, and the reviewer sees a
one-line hash diff next to the renamed kind.

`packages/core/src/ports/EventLog.ts` is deliberately **not** in the gate's
activation paths. Including it would make every added kind expire the
evidence: a compile fix, a test fix, `sf lock` **and** a re-seal, four
ceremonies for an additive change, which is where people start hunting for
the emergency exit. The contract is held by compilation, by a test and by the
lock; the gate covers the two halves above, where the built-artifact argument
is real.

What is not claimed: nothing here enforces the `version` convention. That
would need a rule comparing against the previous commit, which `sf` does not
have. The lock guarantees the reviewer sees the diff, and the reviewer is
what makes the version mean anything. Adding a kind travels the same path as
renaming one, without bumping `version`, so "adding a field is safe,
renaming is breaking" holds as **both are visible, only one is breaking**.

## What is not proven, and is not pretended

- **"One warning on the way down" is per ticket, not per outage.**
  `item.attempt` is per queue item, so a GitHub outage across five tickets
  gives five warnings down and five back. A one-ticket scenario never
  notices. The per-**port** version needs health state per dependency, is
  materially bigger, and waits until somebody runs more than a handful of
  tickets at once.
- **There is no recovery warning after the ceiling.** Past it the item leaves
  the queue and the next one arrives from `amy discover` at attempt zero, so
  nothing carries the history. The ceiling warning already said "I have
  stopped, come and look", and announcing a recovery would credit the machine
  with a person's repair.
- **A crash produces no warning at all.** `FileQueue.recover()` returns the
  item by `rename`, preserving `attempt`, so a worker killed mid-run comes
  back on the *same* attempt. Defensible — a crash is not a dependency going
  down — and worth saying.
- **Reading the log with an older binary drops the lines it does not know.**
  That is the price of filtering unknown kinds in `read()`, and it is
  filtered there and never in `append()`.
- **A contributing plugin still cannot fail alone at boot.** `mount()`
  isolates a throwing `register` per plugin, but any problem refuses the
  whole boot, so an install with three channels where one has bad config will
  not start. That is the boot-time analogue of this work and not its
  criterion.

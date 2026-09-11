# No retry is free

Every retry is charged like useful work. `AttemptOutcome` is
`{ ok, output, at }` with no account of what a run changed
(`packages/workflow-ticket-to-qa/src/record.ts:20`), and an `ok: false`
attempt folds back into the record only to be retried until a per-state
ceiling answers (`packages/workflow-ticket-to-qa/src/machine.ts:162`) — so
a retry that produces no new evidence is billed exactly like one that
produced the fix. The machine's only stops are those ceilings and the
token/USD windows (`packages/core/src/budget.ts:83`), and a `wait`
re-queues the work with `delayMs` and no question about whether another
look is worth anything (`plugins/serial-engine/src/Worker.ts:210`). A
ticket that fails the same way three times burns three full agent runs —
three times the tokens, three times the USD — before `maxImplementAttempts`
ever answers, and the `parked` refusal is only about money already spent,
not money about to be wasted (`plugins/serial-engine/src/Worker.ts:246`).

This was found on the Revv workflow (issue #45), but it is not Revv's to
fix: any workflow whose agent can answer without changing anything needs
the same accounting, and today each one would build its own counter and
its own diagnostic. The core already owns one honest bookkeeping seam —
`applyPlan` counts attempts per state (`packages/core/src/work.ts:80`) —
and the engine already owns one refusal seam — `parked` parks before a
spending action runs (`plugins/serial-engine/src/Worker.ts:177`). What is
missing is the middle: a signal the workflow sends about its own domain
facts, and a stop rule the engine owns.

## What changes

**The outcome carries what a run changed.** `AttemptOutcome` gains
`progress`:

```ts
type Progress =
  | { kind: "advanced"; key: string }
  | { kind: "unchanged"; key: string; detail: string }
  | { kind: "handoff"; detail: string };
```

The workflow decides the domain fact — git diff changed, a review
fingerprint moved, the request needs a person — and the core never parses a
diff or review prose. The serial engine owns the generic half: consecutive
`unchanged` counts per `workId + state + key`, reset by `advanced`, and a
durable reason in the queue item and the event log. `handoff` parks
immediately and never consumes a retry.

**The stop is a budget over evidence, not over money.** The engine, before
executing actions that dispatch to an agent, applies the workflow's
progress policy: at `maxUnchanged` consecutive `unchanged` signals for one
key the next agent start is refused, the work is parked with the key and
detail in the reason, and a `progress.parked` event says what was about to
be spent and why (`packages/core/events.json` gains the kind; the contract
check `checkEvent` is what keeps the line honest). The refusal reuses the
existing `parked` path — the record is not saved, the queue item keeps its
attempt — so a park costs nothing, which is the point.

**Opt-in, with a conservative default.** No workflow changes behaviour
until it emits progress signals or the policy is enabled. `ProgressPolicy`
lives on the workflow runtime contribution (`packages/core/src/runtime.ts:43`)
as an optional member, the same seam as `resumed?` — a workflow without it
runs exactly as today. `maxUnchanged` defaults to 2 and `handoff` to
`park`; the config slice names them `agent.budget.progress.maxUnchanged`
and `agent.budget.progress.handoff`, and `parseBudget`
(`packages/core/src/budget-config.ts:22`) grows the nested shape beside
`perFiveHours`/`perWeek` rather than a second parser.

**The operator sees the waste prevented.** `amy budget` gains the count of
refused starts and the runs they would have cost, read off the event log
the same way `spendSince` reads `agent.run` lines
(`packages/core/src/budget.ts:55`) — a second tally is a second thing to
disagree with what actually happened.

## The gate

`plugin-serial-engine`, extended — it owns the park-before-spend seam and
the failure announcements. The scenario drives a record whose agent
answers `unchanged` three times over the same key:

- `engine.a_no_op_attempt_parks_before_the_next_agent_run`
- `engine.a_changed_key_resets_only_its_own_streak`
- `engine.a_handoff_never_consumes_a_retry`
- `engine.park_reasons_carry_the_key_and_detail`

`amy budget` reads prevented starts from the log, so
`lifecycle.what_the_agents_spent_is_read_off_the_log` grows a prevented
line beside the spent line.

## Acceptance criteria

- [ ] An `unchanged` signal prevents the configured next expensive start
      and the reason names the key and the detail
      (proof: assertion:engine.a_no_op_attempt_parks_before_the_next_agent_run)
- [ ] A changed key or `advanced` resets only its own streak
      (proof: assertion:engine.a_changed_key_resets_only_its_own_streak)
- [ ] A `handoff` parks immediately and never consumes a retry budget
      (proof: assertion:engine.a_handoff_never_consumes_a_retry)
- [ ] A workflow that emits no progress runs exactly as before the policy
      existed (proof: test:plugins/serial-engine/tests/Worker.test.ts)
- [ ] `parseBudget` accepts the nested `progress` block and refuses a
      `handoff` it does not know (proof: test:packages/core/tests/budget-config.test.ts)
- [ ] `amy budget` reports prevented starts from the log, not from a
      counter of its own (proof: test:packages/cli/tests/budget.test.ts)

**Exit condition:** a retry that produces no new evidence is refused before
the agent starts, by every workflow, with the reason a person can read —
and no workflow had to write a counter of its own to get it.
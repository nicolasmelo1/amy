# No retry is free

A retry used to cost exactly as much whether it returned a fix or the same
answer again. `AttemptOutcome` named success and output, but not what the run
changed. The per-state attempt ceiling and the token/USD budget were honest
about work already spent, yet neither could refuse the next agent start when
an earlier answer had added no evidence.

## What shipped

Progress is now an optional workflow contract. A runtime can emit
`advanced`, `unchanged`, or `handoff` signals without teaching the core to
parse its diff, review prose, or ticket fields.

- `ProgressPolicy` lives beside the runtime contribution. A workflow with no
  policy keeps its prior behavior; the ticket-to-QA workflow wires the nested
  budget configuration through as an opt-in policy.
- The serial engine stores unchanged streaks by work, state, and key on the
  queue item. An `advanced` signal clears only its own key, so another stalled
  fact does not become free by accident, and a failed infrastructure retry
  carries the streak forward.
- Before an agent-dispatching action starts, the engine parks work whose
  configured unchanged ceiling is already reached. The parked reason names
  the state, key, and detail; `progress.parked` records the prevented start in
  the event log. A handoff parks at once without charging a retry.
- `amy budget` counts prevented starts from those log events, next to actual
  agent spend. There is no second counter that could disagree with the event
  history.

The implementation arrived in the feature delivery before this close-out
note. Its regression suite proves the domain seams directly; the existing
installed engine scenario remains the gate for the engine's persisted
failure/park boundary.

## Acceptance criteria

- [x] An unchanged signal prevents the configured next expensive start and
      the reason names the key and the detail
      (proof: test:plugins/serial-engine/tests/Worker.test.ts)
- [x] A changed key or `advanced` resets only its own streak
      (proof: test:plugins/serial-engine/tests/Worker.test.ts)
- [x] A `handoff` parks immediately and never consumes a retry budget
      (proof: test:plugins/serial-engine/tests/Worker.test.ts)
- [x] A workflow that emits no progress runs exactly as before the policy
      existed (proof: test:plugins/serial-engine/tests/Worker.test.ts)
- [x] `parseBudget` accepts the nested `progress` block and refuses a
      `handoff` it does not know (proof: test:packages/core/tests/budget-config.test.ts)
- [x] `amy budget` reports prevented starts from the log, not from a
      counter of its own (proof: test:packages/cli/tests/budget.test.ts)

**Exit condition:** a retry that produces no new evidence is refused before
the agent starts, by every opted-in workflow, with the reason a person can
read — and no workflow had to write a counter of its own to get it.

# Waiting is not trying

A state used one counter for two questions: whether the machine had looked at
it before, and whether it had spent a real attempt. A hold for a checkout
therefore consumed implementation attempts without running an agent. The
private workflow worked around that with a prefix in `why` and a list of
logistical effects that were not attempts.

The core now records two counters:

- `looks` counts every `act` and `wait` in a state, so first-look behaviour
  and bounded polling have an honest measure.
- `attempts` counts only an `act` that is a real try. A `wait`, or an `act`
  marked `{ attempt: false }`, adds no attempt.

`act` takes that option before its effects. This keeps ordinary calls unchanged
and lets a workflow name branch preparation, cleanup, or another logistical
look without maintaining its own exception list. An action outcome can also
return `{ notATry: true, retryAfterMs? }`: the serial engine saves the look
without spending an attempt and holds the next look for that delay, or the
engine retry delay when it is absent.

Old records remain readable. A record without `looks` treats its saved
`attempts` as its previous looks, and its next saved move writes the explicit
counter without changing the old attempt count.

The shared helpers are `looksIn` and `attemptsIn`. The shipped workflows use
`looksIn` for first-look announcements and bounded waits, while their ceilings
continue to use `attemptsIn`. The testkit's ceiling probe now lengthens holds
through `looks`, so it rejects a workflow that treats waiting as an agent try.

## Acceptance criteria

- [x] A `wait` adds a look and no attempt, and an `act` adds both
      (proof: test:packages/core/tests/work.test.ts)
- [x] An action outcome marked `notATry` leaves the attempts as they were
      before the look, adds a look, and holds the next look for its
      `retryAfterMs` (proof: test:plugins/serial-engine/tests/Worker.test.ts)
- [x] An `act` marked `{ attempt: false }` adds a look and no attempt
      (proof: test:packages/core/tests/work.test.ts)
- [x] A record saved before this reads with its `attempts` copied into
      `looks`, and its attempts unchanged
      (proof: test:packages/core/tests/work.test.ts)
- [x] Each shipped workflow's first-look checks read looks and its ceilings
      read attempts, and every walkthrough is unchanged
      (proof: assertion:plan.a_refused_draft_goes_back_to_the_agent)
- [x] A state held for the checkout over more looks than its ceiling allows
      escalates on the hold's own bound, never on the attempts ceiling
      (proof: test:packages/workflow-testkit/tests/ceilings.test.ts)

**Exit condition:** a workflow allowing three implementation attempts, whose
tree is held for five looks and prepared once before every try, escalates only
after three runs of the agent that actually failed. Its escalation says three,
and its code carries no prefix in `why` and no list of effects that are not
tries.

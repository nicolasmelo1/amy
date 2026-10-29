# Waiting is not trying

The core keeps one counter per state, `attempts`, and `applyPlan` adds one to it
for every `act` and every `wait`
(`packages/core/src/work.ts`, *"Work done inside a state is counted, so every
retry loop is bounded"*). A workflow reads it for two different questions:

- **How many times did this fail?** This is the ceiling before escalating.
  Examples are `attemptsIn(record, "IMPLEMENTING")` and
  `attemptsIn(record, "CHECKED")` in `ticket-to-qa`, and
  `attemptsIn(record, "WORKING")` in the errand.
- **Have I looked here before?** This is the first-look announcement:
  `attemptsIn(record, "NOTED") === 0` in note-to-plan, `"QUEUED"` in the
  errand, and `"REVIEWER_ASSIGNED"` and `"QA_HANDOFF"` in `ticket-to-qa`.

One number cannot answer both. A ceiling reached by waiting is a ceiling
reached without ever trying, and the private workflow amy runs at work, the
largest written on amy, has paid for it twice:

- **One ticket** escalated with "the ticket still does not say enough after
  three rounds" when nobody had been asked three times. Each look that held for
  the checkout was a `wait`, and each was counted.
- **Another** spent two of its three `IMPLEMENTING` attempts putting the tree
  on its branch, then ran one real round. It escalated saying the
  implementation "did not come together in three attempts": $0.99 of agent for
  one try out of a budget of three.

It cannot say so in the plan either. `Plan` is the core's type and a workflow
cannot add to it, so that workflow marks a hold by starting `why` with a
string, `HELD_BY = "the checkout is held by "`. Its `apply` then reads that
prefix back to undo the count, and keeps a `TREE_LOGISTICS` set of effects
whose `act` is not a real attempt. Both are workarounds for a contract that
has no word for "this look was not a try". [An escalation can be
withdrawn](an-escalation-can-be-withdrawn.md) found the same defect from the
other side: "a counter that charged a branch checkout to the implementing
state, so one real round was billed as three."

## What changes

**Two counters, each with one meaning.**

- `looks[state]` counts every look the record took in the state: `act`,
  `wait`, all of them. It answers "have I been here before", and bounds how
  long a state may wait.
- `attempts[state]` counts only tries: an `act` that is not marked otherwise.
  It answers "how many times did this fail", and is what a ceiling reads.

A `wait` is never an attempt. It is a look, and it is counted as one.

**An act can say it is not a try.** `act(why, ...effects)` gains an optional
`{ attempt: false }`, for a look that only puts the world in place for the
try: a branch prepared, a tree cleaned, a stale lock released. It counts as a
look and not as an attempt. That covers the private workflow's `TREE_LOGISTICS`
with the word for it, and its `HELD_BY` prefix goes away, because a hold is a
`wait` and a wait already costs no attempt.

**An outcome can say the try never happened.** Some looks are known not to be
tries only after the action ran. A run cut off by a usage limit is the case
*a usage limit is not an attempt* names. The engine charges the attempt in
`applyPlan`, before the runtime folds the outcomes
(`Worker.advance`, `plugins/serial-engine/src/Worker.ts`). So the core adds a
second, generic step: an action may return `{ notATry: true, retryAfterMs? }`.
The engine then moves that look's count from `attempts` back to `looks`, in the
same save, and holds the item for `retryAfterMs` (or the state's backoff)
before the next look. The workflow's fold sees the refunded record, and no
workflow has to undo a count by hand.

**The helpers say which they read.** The core exports `looksIn(record, state)`
and `attemptsIn(record, state)` beside `advance`, `act`, `wait` and `settled`
([a workflow is three pieces](a-workflow-is-three-pieces.md)), so no
workflow writes either. Each first-look check in the shipped workflows moves to
`looksIn`, each ceiling stays on `attemptsIn`, and `ticket-to-qa`'s bounded
wait for a reviewer (`looks = attemptsIn(record, "REVIEWER_ASSIGNED")`)
becomes the `looksIn` its own variable name already says it is.

**A record written before this keeps its meaning.** On read, a record with no
`looks` gets a copy of its `attempts` as `looks`. Nothing in the old count
tells a try from a wait, so the attempts are kept as they are. Keeping them
can only make the ceiling more cautious than it should be. Resetting them
could let a defect retry forever.

[A usage limit is not an attempt](a-usage-limit-is-not-an-attempt.md) becomes
a case of this. A ladder that ends on `rate-limited` is a `wait`, and a wait
costs no attempt.

## Acceptance criteria

- [ ] A `wait` adds a look and no attempt, and an `act` adds both
      (proof: deferred:test:packages/core/tests/work.test.ts)
- [ ] An action outcome marked `notATry` leaves the attempts as they were
      before the look, adds a look, and holds the next look for its
      `retryAfterMs` (proof: deferred:test:plugins/serial-engine/tests/Worker.test.ts)
- [ ] An `act` marked `{ attempt: false }` adds a look and no attempt
      (proof: deferred:test:packages/core/tests/work.test.ts)
- [ ] A record saved before this reads with its `attempts` copied into
      `looks`, and its attempts unchanged
      (proof: deferred:test:packages/core/tests/work.test.ts)
- [ ] Each shipped workflow's first-look checks read looks and its ceilings
      read attempts, and every walkthrough is unchanged
      (proof: assertion:plan.a_refused_draft_goes_back_to_the_agent)
- [ ] A state held for the checkout over more looks than its ceiling allows
      escalates on the hold's own bound, never on the attempts ceiling
      (proof: deferred:walkthrough in the testkit)

**Exit condition:** a workflow allowing three implementation attempts, whose
tree is held for five looks and prepared once before every try, escalates only
after three runs of the agent that actually failed. Its escalation says three,
and its code carries no prefix in `why` and no list of effects that are not
tries.

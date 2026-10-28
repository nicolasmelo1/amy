# Decisions are asked in a batch

When `ticket-to-qa` disagrees with a review comment, it escalates on the spot.
`planHumanFix` (`packages/workflow-ticket-to-qa/src/machine.ts`) finds the
disagreements and goes to `ESCALATED` in the same look:

```ts
if (disagreed.length > 0 && !alreadyEscalated) {
  return advance("ESCALATED", `${disagreed.length} comment(s) need the owner's call`, …);
}
```

That is right for a person who wants every call as it comes. It is wrong for
one who would rather decide once. A bot reviewer asks for six changes, one
needs the owner, and the owner is interrupted; the next round asks for four and
one more needs them, and they are interrupted again; the round after has two
changes and nothing for them. Two decisions, two interruptions, and the first
was taken before the second existed — while the pull request was still moving
under it, so it may not even apply any more.

One operator put it plainly: many small decisions wear a person out, and
nothing is lost by holding them until the machine has settled everything it can.

## The policy

`policy.decisions`, `immediate` by default so nothing changes for anybody who
does not ask:

- **`immediate`** is today.
- **`batch`** holds each round's disagreements on the record instead of
  escalating, and keeps working the rest. It escalates when a round produces
  **no new disagreement** and some are held. Before sending, each held one is
  re-read against the pull request as it stands: a thread that was resolved,
  outdated by a later commit, or answered by the reviewer is dropped. What is
  left goes to the owner in one message, and the record is `ESCALATED` once.

Held decisions are not the same as deferred work. *The review is remembered
across rounds* gives a thread a verdict that outlives the round; this keeps the
moment of asking. A round that only repeats subjects an earlier round settled
produces nothing new, so it is the round that sends the batch — which is how
the two plans meet.

## What does not wait

A gate red past its attempts, a pull request too large for an agent, and a
roster with nobody on it are not review decisions. Nothing can move until
they are answered, so holding them would only stall the work. They escalate
as they do today.

## Acceptance criteria

- [ ] With `immediate`, a disagreement escalates in the look it is found, as
      today (proof: deferred:test:packages/workflow-ticket-to-qa/tests/machine.test.ts)
- [ ] With `batch`, a round with a disagreement does not escalate and the rest
      of its changes are made (proof: deferred:test:packages/workflow-ticket-to-qa/tests/machine.test.ts)
- [ ] Two rounds with one disagreement each, then a round with none, escalate
      once with both (proof: deferred:walkthrough in the testkit)
- [ ] A held disagreement whose thread was resolved or outdated before the batch
      is sent is dropped from it (proof: deferred:walkthrough in the testkit)
- [ ] A batch whose every held decision was dropped escalates nothing and the
      work moves on (proof: deferred:walkthrough in the testkit)
- [ ] A gate red past its attempts escalates at once under `batch`
      (proof: deferred:test:packages/workflow-ticket-to-qa/tests/machine.test.ts)
- [ ] An unknown `policy.decisions` value is refused at boot by name
      (proof: deferred:test:packages/workflow-ticket-to-qa/tests/plugin.test.ts)

**Exit condition:** under `policy.decisions: batch`, three review rounds that
find one, one and zero decisions reach the owner as one message carrying the two
that still apply, after the third round and not before.

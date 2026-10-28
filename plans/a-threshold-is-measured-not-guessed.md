# A threshold is measured, not guessed

Every rung of a decider ladder has an `accept`, and nothing yet says what the
number should be. Nobody can say it in general. A 0.9 from an encoder is not
a 0.9 from a 9B decoder, and neither is a 0.9 from either one on a different
question. As of October 2026 none of the decision models *a decision is
asked of a port* names has published calibration data, and the vendors' own
guides tell you to set thresholds from your own labelled examples. A
threshold typed by hand is a guess, and it reads as if somebody had measured
it.

## What changes

**A question declares what a mistake costs.** Next to its answers and its
fallback, each question names the error it tolerates on the answer that is
expensive to get wrong. For `reply-kind` that is `decision`: a discussion
read as a decision resumes work on a question. The workflow knows the cost of
its own mistakes. The operator should not have to know it.

**Examples come from the record first.** Every verdict on the record (see *a
decision is asked of a port*) is an example. When a person then marks a reply
differently from how the ladder read it, or says "that was a question" in the
thread, the correction is its label. A workflow can also ship a seed set of
hand-labelled examples, written under `L6.FIXTURES_NAME_NOBODY_REAL`, so a
new install has something to measure before it has a history.

**`amy decide measure <question>` sets the threshold.** It runs every
configured decider over the labelled examples. For each, it prints accuracy
and coverage at each threshold (coverage is how often the decider would
decide at all). It writes the lowest `accept` that keeps the expensive error
under the question's tolerance, keyed by the decider and the digest of its
weights or the model version a hosted one reports.

**An unmeasured rung shadows.** A rung with no measured threshold, or with
one measured against other weights, is still asked, and its verdict is
recorded. It never decides: the next rung or the fallback does. This is how a
new model collects its own examples on real threads without moving anything,
and how pulling new weights quietly takes a model back out of deciding until
somebody measures it again.

A hand-written `accept` stays possible and is reported as unmeasured by `amy
doctor`. Refusing it outright would leave somebody with no examples yet with
no ladder at all.

## Acceptance criteria

- [ ] A rung with no measured threshold records its verdict and never decides
      (proof: deferred:test:packages/agent-kit/tests/deciders.test.ts)
- [ ] `amy decide measure` over labelled examples writes the lowest threshold
      that keeps the expensive error under the question's tolerance, and
      prints accuracy and coverage for every threshold it tried
      (proof: deferred:test:packages/cli/tests/decide.test.ts)
- [ ] A person's mark that disagrees with a recorded verdict becomes a
      labelled example (proof: deferred:walkthrough in the testkit)
- [ ] Pulling weights with a different digest returns the rung to shadow, and
      `amy doctor` names it (proof: deferred:test:packages/cli/tests/decider.test.ts)

**Exit condition:** a decider whose threshold was never measured only records
what it would have said. After `amy decide measure` runs on the examples it
starts deciding, and new weights for the same model put it back in shadow
until it is measured again.

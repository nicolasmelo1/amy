# A usage limit is not an attempt

`AgentOutcome` has a `rate-limited` (`packages/core/src/agent-run.ts`), kept
apart from `failed` because the two want opposite moves, and the ladder honours
it: a rate-limited rung skips the rest of its harness and hands the next
harness the half-done tree (`packages/agent-kit/src/ladder.ts`,
`handoff.ts`). Two things stop that from reaching a person running on a
subscription.

**Codex never says it.** `classify` in `plugins/codex/src/CodexHarness.ts`
reads the exit code and whether a turn finished, and says so in its own
comment: *"a rate limit therefore reads as `failed` here"*. The Hermes harness
says the same. The decision behind it — do not invent the distinction from
stderr text — is right, and it leaves the most common subscription harness
unable to report the most common way a subscription stops.

**A rate limit on the last rung is spent as an attempt.** A ladder with one
harness has no next harness to hand to, so the run ends, the workflow records
an attempt, and `attemptsIn` counts it. A workflow that allows two attempts
— because tokens are paid for — loses half of them to the clock.

## What changes

**Codex reports a usage limit from something structured.** The first thing the
work does is capture a real limited run of `codex exec --json` and find the
field that says so — an error event's code, a status the CLI prints as data,
an exit code it documents — and record it as a fixture. If there is no
structured signal, the plan says that, and Codex stays `failed`: guessing from
prose is the thing the harness was built not to do.

**A rate limit with nowhere to go is a wait.** When the ladder ends on
`rate-limited`, the step's plan is a `wait`, and since
[waiting is not trying](waiting-is-not-trying.md) a wait is a look and never an
attempt, so the attempt is not recorded. The workflow waits — until the
reset time when the harness reports one, the policy's backoff otherwise — and
the same step runs again on the tree as it was left, with the handoff note
saying it is continuing. `no-retry-is-free` does not count it: a wait adds no
evidence and spends nothing.

## Acceptance criteria

- [ ] A recorded limited Codex run classifies as `rate-limited`, and a recorded
      failed one still as `failed`
      (proof: unspecified:which field carries the signal is the first thing the work finds; the fixture is the check once it is known)
- [ ] A ladder ending on `rate-limited` records no attempt, and `attemptsIn`
      is unchanged (proof: deferred:test:packages/workflow-ticket-to-qa/tests/machine.test.ts)
- [ ] The step waits until the reported reset time, or the policy's backoff
      when none is reported, and then runs again on the tree it left
      (proof: deferred:walkthrough in the testkit)
- [ ] With two attempts allowed, a run that is limited twice and then fails
      twice escalates after the second failure, not the second limit
      (proof: deferred:walkthrough in the testkit)
- [ ] A limited run spends nothing against `no-retry-is-free`'s no-evidence
      count (proof: deferred:test:packages/workflow-ticket-to-qa/tests/retry.test.ts)

**Exit condition:** a workflow allowing two attempts, on a single Codex rung,
survives any number of usage limits and escalates only after two runs that
actually failed.

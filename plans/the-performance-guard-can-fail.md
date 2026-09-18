# The performance guard can fail

`L6.PERFORMANCE_REGRESSION_IS_GUARDED` is enabled here, and the CI step exists:
`npm run bench`, which is `vitest bench --compare` against a committed baseline.
The step cannot go red.

Point that command at a baseline claiming twenty times the throughput — a
regression no one would ship — and it prints the arrow and exits zero:

```
· adds up a five hour window of a busy week   [0.05x] ⇓
· decides against both windows                [0.05x] ⇓
exit code 0
```

`vitest bench --compare` reports a comparison. It never judges one. So the build
stays green through any regression, and the sentence the rule is there for —
*a committed baseline is what turns that from an incident into a failed build* —
is not true of this repository.

## Two defects, not one

**Nothing reads the comparison.** The run produces the numbers and the step
throws them away. What is missing is the part that decides: read the comparison,
exit non-zero past a declared threshold. The threshold is a number somebody can
raise the next time a build is inconvenient, so it belongs where the other
ceilings live — in the policy the guardrail watches for weakening — rather than
inside a script nobody diffs.

**The baseline has no environment.** The committed file records absolute times
measured under `/workspace/automate-my-work/...`, a path that exists on no
developer's machine here, and CI compares them against whichever runner it was
handed that morning. Even once the step can fail, a comparison across two
machines produces a verdict that means nothing — and a threshold wide enough to
survive that variance is wide enough to pass a real regression.

So a baseline names the environment it was taken on, and a comparison across two
of them reports unavailable rather than pass or fail.

## Why it is written down rather than just fixed

The fix is small. The reason it is a plan is the gate: a guard that cannot fail
is indistinguishable from one that protects you, and the only way to know which
one this is, now or after somebody rewrites the script, is to keep a baseline
that must go red and prove every run that it does.

## Acceptance criteria

- [ ] A baseline that claims the code used to be twenty times faster fails the
      gate, and the failure names the benchmark and the ratio
      (proof: test:scripts/tests/bench-gate.test.ts)
- [ ] The unmutated baseline passes the same gate, so a guard that always fails
      is refused too
      (proof: test:scripts/tests/bench-gate.test.ts)
- [ ] The threshold lives in the policy the guardrail watches, and raising it is
      a weakening the policy check reports
      (proof: test:scripts/tests/bench-gate.test.ts)
- [ ] A baseline carries the environment it was measured on, and comparing
      across two environments reports unavailable rather than a verdict
      (proof: unspecified:whether the environment rides in the baseline's own
      format or in an evidence artifact is the first thing the work decides, and
      it changes where the field is read)

**Exit condition:** a commit that makes the budget ledger twenty times slower
turns this repository's build red naming the benchmark, and the same gate goes
red the day somebody replaces the comparison with a command that only reports.

---
sources:
  - { id: S1, kind: code, ref: ".github/workflows/software-factory.yml", said: "L6.PERFORMANCE_REGRESSION_IS_GUARDED is enabled and CI runs npm run bench, vitest bench --compare against a committed baseline; the step cannot go red" }
  - { id: S2, kind: friction, said: "against a baseline claiming twenty times the throughput it prints the arrow ([0.05x] ⇓ on the five-hour-window and both-windows benches) and exits 0: --compare reports a comparison, never judges one" }
  - { id: S3, kind: decision, said: "something reads the comparison and exits non-zero past a declared threshold; the threshold lives in the policy the guardrail watches for weakening, beside the other ceilings, not in a script nobody diffs" }
  - { id: S4, kind: code, ref: "packages/core/tests/bench-baseline.json", said: "the committed baseline records absolute times measured under /workspace/automate-my-work/..., a path on no developer's machine here, and CI compares them against whichever runner it got" }
  - { id: S5, kind: decision, said: "a cross-machine verdict means nothing, and a threshold wide enough for that variance passes a real regression; so a baseline names its environment, and a cross-environment comparison reports unavailable, not pass or fail" }
  - { id: S6, kind: decision, said: "a guard that cannot fail is indistinguishable from one that protects, so the gate keeps a baseline that must go red and proves every run that it does, surviving a rewrite of the script" }
touches:
  - package.json
  - scripts/tests/bench-gate.test.ts
  - packages/core/tests/bench-baseline.json
  - .github/workflows/software-factory.yml
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "a baseline claiming the code used to be twenty times faster fails the gate, and the failure names the benchmark and the ratio", proof: "test:scripts/tests/bench-gate.test.ts", sources: [S1, S2, S3, S6] }
  - { id: A2, statement: "the unmutated baseline passes the same gate, so a guard that always fails is refused too", proof: "test:scripts/tests/bench-gate.test.ts", sources: [S6] }
  - { id: A3, statement: "the threshold lives in the policy the guardrail watches, and raising it is a weakening the policy check reports", proof: "test:scripts/tests/bench-gate.test.ts", sources: [S3] }
  - { id: A4, statement: "a baseline carries the environment it was measured on, and comparing across two environments reports unavailable rather than a verdict", proof: "unspecified:whether the environment rides in the baseline's own format or in an evidence artifact is the first thing the work decides, and it changes where the field is read", sources: [S4, S5] }
failures:
  - { step: bench comparison, when: "a benchmark is slower than the declared threshold allows", goes_to: "non-zero exit naming the benchmark and the ratio" }
  - { step: bench comparison, when: "baseline and run come from two environments", goes_to: "unavailable, neither pass nor fail" }
exit: "a commit making the budget ledger twenty times slower turns this repository's build red naming the benchmark, and the same gate goes red the day somebody replaces the comparison with a command that only reports"
---
# The performance guard can fail

The benchmark step compares against a committed baseline but never judges the comparison, so the build stays green through any regression, and the baseline was measured on a machine nobody here has.

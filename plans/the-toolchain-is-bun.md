# The toolchain is bun

Bun appears in exactly one line of this repository: the `bun build --compile`
inside `scripts/build-binary.sh`. Dependencies, build, tests, coverage, lint,
dead code, audit and benchmarks all run on npm and node 24.

So the runtime that ships is never the runtime anything is tested on. Every
one of the 45 test files runs on node, and the artifact every one of them is
supposed to be about runs on bun.

## This has already cost a day once

The loader resolved plugins with `await import(spec)`. All 512 tests passed,
because on node that specifier resolves out of `node_modules`. A bundler
cannot follow a specifier it cannot read, so the first compiled binary would
have mounted **zero** plugins and passed the entire suite on the way there.

That was found by building the binary and running it, which is now a gate.
But the gate is one scenario, and the suite is 45 files. Every difference
between the two runtimes that the scenario does not happen to walk through is
a difference nothing checks: module resolution, the `node:` shims, what
`process.env` does after `--define` has rewritten parts of it, how the fs
calls behave. The scenario proves the binary boots and mounts. It does not
prove the other 500 things the tests are about hold there.

Running the tests on the runtime that ships closes that by construction
rather than by adding scenarios one bug at a time.

## What changes

**Dependencies.** `bun install`, and `bun.lock` replaces
`package-lock.json`. The workspace layout stays as it is: `packages/*` and
`plugins/*` are already what both tools mean by workspaces.

**Tests.** The 45 files move off vitest. This is the bulk of the work and the
only part with real friction, because three things are attached to vitest and
not to the tests: `@vitest/coverage-v8`, the `vitest bench --compare` against
`packages/core/tests/bench-baseline.json`, and `vitest.config.ts`. Each needs
an answer under bun before the move, not after.

**CI.** The workflow stops installing node and npm and runs the gate on bun,
so what CI proves is what a release is compiled from.

**`build-binary.sh` stops shelling out to npm** for the `tsc` step.

`tsc` stays. Every workspace package points its `exports` at a `dist` that
`tsc --build` produces, and bun compiling from that `dist` is the arrangement
that already works. Bun is not being adopted as a type checker.

## The two rules this must not break

`L6.DEAD_CODE_IS_DETECTED` is satisfied by knip and
`L6.DEPENDENCY_VULNERABILITIES_ARE_SCANNED` by `npm audit`. Both are named in
the gate and both are node tools. Whether each keeps working through bun, is
replaced by a bun equivalent, or is the one thing still invoked through node
has to be decided rather than discovered when the gate goes red.

## Acceptance criteria

- [ ] A clean checkout installs with `bun install` and produces a `bun.lock`
      that resolves every workspace package
      (proof: deferred:the repository still installs with npm)
- [ ] The whole suite runs on bun and passes, so the runtime under test is
      the runtime that ships
      (proof: deferred:the tests still run on vitest)
- [ ] Coverage is still measured and still gates
      (proof: deferred:coverage is attached to vitest)
- [ ] The benchmarks still compare against a stored baseline
      (proof: deferred:the comparison is a vitest feature)
- [ ] Dead code is still detected
      (proof: deferred:knip's place in a bun gate is undecided)
- [ ] Dependencies are still audited for known vulnerabilities
      (proof: deferred:the replacement for `npm audit` is undecided)
- [ ] The gate is one command and CI runs that command on bun with no node
      setup step (proof: deferred:the workflow still installs node)
- [ ] Building the binary no longer invokes npm
      (proof: deferred:`build-binary.sh` shells out to npm for the tsc step)
- [ ] Reintroducing a dynamic `import(spec)` in the loader turns the suite
      red, and not only the binary scenario
      (proof: deferred:this is the property the migration exists for)

**Exit condition:** `npm` appears nowhere in the gate, in CI, or in the build
script, the full suite runs on the same runtime the shipped executable does,
and a resolution bug that only a bundler would see is caught by the tests
rather than by compiling and running the binary.

# Contributing to amy

## The five minutes before your first change

```sh
git clone https://github.com/nicolasmelo1/amy && cd amy
npm ci
npm run build
npm test          # 870 tests, about two seconds
```

If that is green, everything below is optional reading until you need it.

The one thing worth knowing before you touch anything: **`sf` is not
optional.** It is the tool that turns this repository's rules into checks that
fail, and `npm run gate` runs it. Install it once:

```sh
cargo install --git https://github.com/nicolasmelo1/software-factory --tag v0.4.0 --locked
```

## What has to be green

```sh
npm run gate      # build, typecheck, release config, coverage, lint, knip, audit, sf check, sf verify
npm run e2e       # seven scenarios driving the installed command, a few minutes
```

`npm run gate` is what CI runs, minus the scenarios. Run it before you open a
pull request; it is faster to be told by your own machine.

Two of those are worth understanding rather than just obeying:

- **`npm run typecheck`** covers the *tests*, which `npm run build` does not:
  the build compiles `src` only, and vitest strips types without checking
  them. Without this step a test can reference a field that does not exist and
  stay green.
- **`sf verify`** proves every enabled rule *fires*, by running it against a
  deliberately broken fixture. A rule that cannot fail is a rule that is
  lying, and this is what stops one existing.

## The gates, and the thing that will surprise you

Seven **gates** each pin a claim to a scenario that proves it, with the
evidence sealed by digest. A gate lists *activation paths*; touching one of
them makes its evidence stale, and `sf check` goes red until the scenario runs
again:

```
✗ critical L3.GATE_HAS_FRESH_EVIDENCE
    the implementation changed since gate `ticket-to-qa` was proven
```

That is not a bug. It is the point: the proof was about code that no longer
exists. Re-run and re-seal:

```sh
./.software-factory/evidence/ticket-to-qa-scenario.sh
sf seal ticket-to-qa
```

Never hand-edit a digest. If the scenario cannot pass, the finding is the
product's behaviour, not the gate's.

## The one architectural rule

**The core knows no workflow and no plugin.** `packages/core` owns the
catalogue of actions and the contracts; a workflow composes them. There is a
local rule that fails the build on `from "@amy/workflow-*"` or
`from "@amy/plugin-*"` anywhere under `packages/core/src`, because this is the
invariant the whole plugin model rests on and it is one import away from being
lost.

Everything else follows from it:

```text
packages/core            contracts, the action catalogue, the registry
packages/workflow-*      what happens next, and how. Depends only on core
plugins/*                adapters. Depend on core, and on a workflow only for
                         the types that workflow declares
packages/cli             the command. Nothing depends on it
```

A **workflow** is two halves: `plan()`, which is pure and says *what* should
happen, and a runtime, which says *how*. If you find yourself wanting to
`await` something inside `plan()`, the thing you want belongs in the runtime —
purity is what lets a whole lifecycle be driven in a test in milliseconds.

Writing one is `/amy-workflow`, and you do not need to be in this repository
to do it: a workflow is a package, and yours can live anywhere.

## Conventions that are not negotiable

- **A comment says why, not what.** There is a rule with a line ceiling on
  comment blocks; past a handful of lines a comment stops being read and
  starts being scrolled past. If the reasoning is genuinely long it belongs in
  a document under `plans/` or `docs/` that the comment links to.
- **A test name is a sentence about behaviour**, not about a method.
  `refuses a second claim`, not `test claim()`.
- **Every workflow has a walkthrough test** that drives the whole lifecycle
  against a fake world and asserts the states in order, that one look makes at
  most one move, and that it settles instead of spinning. It is the test that
  finds the bugs.
- **A skipped test says why.** There is a rule for that too.
- **No `any`.** The message the rule gives you names the alternative.

## Changing behaviour

Every change that a user would notice needs a changeset:

```sh
npm run changeset
```

Write it for somebody reading the changelog six months from now: what changed,
and *why it was wrong before*. The existing ones in `.changeset/` are the
house style.

A change big enough to have a shape — a new lifecycle state, a new port, a
phase of work — gets a plan in `plans/`, listed in
[`plans/next-steps.md`](plans/next-steps.md), with acceptance criteria that
each name the check that proves them. There is a rule that fails a plan whose
criterion names no check, and one that fails a plan with no exit condition.

## Where to ask

Open an issue. If you hit something that got in your way while working — an
error message that did not say enough, a step that needed three tries — that
is exactly what `amy note` is for, and it becomes a plan in this repository.

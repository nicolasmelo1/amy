---
title: Contributing
description: The five minutes before your first change, and the one rule everything follows from.
group: Development
order: 1
---

# Contributing

This page is about changing **amy itself**. If you want amy to do your process,
you do not need to be in this repository at all — see
[Write a workflow](../build/write-a-workflow.md).

## The five minutes before your first change

```sh
git clone https://github.com/nicolasmelo1/amy && cd amy
npm ci
npm run build
npm test          # about two seconds
```

If that is green, everything below is optional reading until you need it.

The one thing worth knowing first: **`sf` is not optional.** It is the tool that
turns this repository's rules into checks that fail, and `npm run gate` runs it.

```sh
cargo install --git https://github.com/nicolasmelo1/software-factory --tag v0.4.0 --locked
```

## What has to be green

```sh
npm run gate      # build, typecheck, release config, coverage, lint, knip, audit, docs, sf
npm run e2e       # seven scenarios driving the installed command, a few minutes
```

`npm run gate` is what CI runs, minus the scenarios. Run it before you open a
pull request; it is faster to be told by your own machine.

Three of those are worth understanding rather than obeying:

- **`npm run typecheck`** covers the *tests*, which `npm run build` does not: the
  build compiles `src` only, and vitest strips types without checking them.
  Without this a test can reference a field that does not exist and stay green.
- **`npm run docs:check`** fails when the code moved and the generated
  documentation did not. Run `npm run docs:generate` and commit the result —
  see [Documentation](documentation.md).
- **`sf verify`** proves every enabled rule *fires*, by running it against a
  deliberately broken fixture. A rule that cannot fail is a rule that is lying.

## The one architectural rule

**The core knows no workflow and no plugin.** There is a local rule that fails
the build on `from "@amykit/workflow-*"` or `from "@amykit/plugin-*"` anywhere under
`packages/core/src`, because this is the invariant the whole plugin model rests
on and it is one import away from being lost.

Everything else follows from it — see [Architecture](../concepts/architecture.md).

A **workflow** is two halves: `plan()`, which is pure and says *what* should
happen, and a runtime, which says *how*. If you find yourself wanting to `await`
something inside `plan()`, the thing you want belongs in the runtime.

## Conventions that are not negotiable

- **A comment says why, not what.** There is a rule with a line ceiling on
  comment blocks; past a handful of lines a comment stops being read and starts
  being scrolled past. If the reasoning is genuinely long it belongs in a
  document under `plans/` or `docs/` that the comment links to.
- **A test name is a sentence about behaviour**, not about a method. `refuses a
  second claim`, not `test claim()`.
- **Every workflow has a walkthrough test** that drives the whole lifecycle
  against a fake world and asserts the states in order, that one look makes at
  most one move, and that it settles instead of spinning.
- **A skipped test says why.** There is a rule for that too.
- **No `any`.** The message the rule gives you names the alternative.

## Changing behaviour

```sh
npm run changeset
```

Write it for somebody reading the changelog six months from now: what changed,
and *why it was wrong before*.

A change big enough to have a shape — a new lifecycle state, a new port, a phase
of work — gets a plan in `plans/`, listed in `plans/next-steps.md`, with
acceptance criteria that each name the check that proves them. There is a rule
that fails a plan whose criterion names no check, and one that fails a plan with
no exit condition.

## Where to ask

Open an issue. If you hit something that got in your way while working — an
error message that did not say enough, a step that needed three tries — that is
exactly what `amy note` is for, and it becomes a plan in this repository.

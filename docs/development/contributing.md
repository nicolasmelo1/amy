---
title: Contributing
description: What to set up before your first change, and the one rule everything follows from.
group: Development
order: 1
---

# Contributing

This page is about changing **amy itself**. If you want amy to run your process,
you do not need to be in this repository at all; see
[Write a workflow](../guides/write-a-workflow.md).

## Before your first change

```sh
git clone https://github.com/nicolasmelo1/amy && cd amy
./scripts/setup-dev.sh
npm test
```

`setup-dev.sh` is the whole setup on a machine that has never seen this
repository: the dependencies, `sf` at the version this repository locked, the
`oasdiff` the contract check needs, the git hooks, and a build. It is safe to
run again, which is the fastest way to find out what a machine is missing. It
needs [rust](https://rustup.rs) to build `sf`, and says so rather than guessing.
`bun` is optional: only `npm run e2e` needs it.

If that is green, everything below is optional reading until you need it.

The one thing to know first: **`sf` is not optional.** It is the tool that
turns this repository's rules into checks that fail, and `npm run gate` runs it.
By hand:

```sh
cargo install --git https://github.com/nicolasmelo1/software-factory --tag v0.4.4 --locked
```

That version is not a suggestion: the catalog ships inside the binary, so a
different `sf` enforces a different set of rules. The mismatch is invisible on
the machine holding the newer one and red in CI, which is why
`.software-factory/catalog.lock.json` is the source of truth and
`npm run check:toolchain` fails when anything installing `sf` disagrees with
it.

## The hooks

The setup script points `core.hooksPath` at `.githooks`, and so does `npm ci`
(the `prepare` script), so a clone that installs is a clone with them on. Git
will not enable a hook out of a checkout on its own, which is a security
property rather than an oversight.

| Hook | What it runs | Cost |
| :-- | :-- | :-- |
| `pre-commit` | build, typecheck, the toolchain, docs, plans, private-reference, config and release checks, the tests, lint, `sf verify`, `sf check` | the fast half of the gate |
| `pre-push` | `npm run gate`, which is what CI runs | the whole gate |

Both take `--no-verify`. `pre-commit` reads the working tree rather than the
staged content, so a deliberately partial commit is checked loosely and
`pre-push` has the last word.

## What has to be green

```sh
npm run gate      # what CI runs: build, typecheck, the repository checks, docs, coverage, lint, knip, audit, sf
npm run e2e       # every scenario, driving the installed command; minutes, and needs bun
```

`npm run gate` is what CI runs, minus the scenarios. Run it before you open a
pull request; it is faster to be told by your own machine. What is in it, and
why each gate exists: [The gate](the-gate.md).

Some of it is worth understanding rather than obeying:

- **`npm run typecheck`** covers the *tests*, which `npm run build` does not: the
  build compiles `src` only, and vitest strips types without checking them.
  Without it a test can reference a field that does not exist and stay green.
- **`npm run docs:check`** fails when the code moved and the generated
  documentation did not, and when the written half breaks a prose rule. Run
  `npm run docs:generate` and commit the result; see
  [Documentation](documentation.md).
- **`sf verify`** proves every enabled rule *fires*, by running it against a
  deliberately broken fixture. A rule that cannot fail is a rule that is lying.

## The one architectural rule

**The core knows no workflow and no plugin.** `L0.CORE_STAYS_IGNORANT` fails
the build on `from "@amykit/workflow-*"` or `from "@amykit/plugin-*"` anywhere
under `packages/core/src`, because this is the invariant the plugin model rests
on and it is one import away from being lost.

Everything else follows from it; see [Architecture](../concepts/architecture.md).

A **workflow** is one `defineWorkflow` call over a diagram: `workflow.mmd` says
where work can go, `decide` says where it goes next, one pure decision per
drawn state, and `actions` say what happens in the world. If you find yourself
wanting to `await` something inside a decision, the thing you want belongs in an
action. Why: [a workflow is one declaration](../design/a-workflow-is-one-declaration.md).

## Conventions that are not negotiable

- **A comment says why, not what.** A rule puts a line ceiling on comment
  blocks; past a handful of lines a comment stops being read and starts being
  scrolled past. Reasoning that runs longer belongs in a document under
  `plans/` or `docs/` that the comment links to.
- **A test name is a sentence about behaviour.** `refuses a second claim`, where
  `test claim()` would say nothing.
- **Every workflow has a walkthrough test** that drives the whole lifecycle
  against a fake world and asserts the states in order, that one look makes at
  most one move, and that it settles instead of spinning; see
  [Testing](../build/testing.md).
- **A skipped test says why.** A rule holds that too.
- **No `any`.** The message the rule gives you names the alternative.

## Changing behaviour

```sh
npm run changeset
```

Write it for somebody reading the changelog long after: what changed, and *why
it was wrong before*.

A change big enough to have a shape (a new lifecycle state, a new port, a phase
of work) gets a plan in `plans/`, listed in `plans/next-steps.md`, with
acceptance criteria that each name the check that proves them.
[CONTRIBUTING.md](https://github.com/nicolasmelo1/amy/blob/main/CONTRIBUTING.md)
has the plan's shape and the rules that hold it.

## Where to ask

Open an issue. If something got in your way while working, an error message
that did not say enough or a step that needed retrying, that is what `amy note`
is for (when the `note-to-plan` workflow is mounted), and it becomes a plan in
this repository.

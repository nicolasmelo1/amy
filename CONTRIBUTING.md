# Contributing to amy

## Before your first change

```sh
git clone https://github.com/nicolasmelo1/amy && cd amy
./scripts/setup-dev.sh
```

That is the whole setup, on a machine that has never seen this repository. It
installs the dependencies, `sf` at the version this repository locked and the
`oasdiff` the contract check needs, enables the git hooks, and builds. It is
safe to run again, which is the fastest way to find out what a machine is
missing. It needs [rust](https://rustup.rs) to build `sf`, and it will say so
rather than guess. `bun` is optional: only `npm run e2e` needs it.

The one thing worth knowing before you touch anything: **`sf` is not
optional.** It is the tool that turns this repository's rules into checks that
fail, and `npm run gate` runs it. The setup script installs it; by hand it is:

```sh
cargo install --git https://github.com/nicolasmelo1/software-factory --tag v0.4.4 --locked
```

That version is not a suggestion. The catalog ships inside the binary, so a
different `sf` enforces a different set of rules, and the mismatch is
invisible on the machine that has the newer one and red in CI. It is written
in `.software-factory/catalog.lock.json`, everything that installs `sf` is
checked against it by `npm run check:toolchain`, and the setup script reads it
rather than keeping a copy.

Then:

```sh
npm test          # the unit tests
```

If that is green, everything below is optional reading until you need it.

## The hooks

`./scripts/setup-dev.sh` points `core.hooksPath` at [`.githooks`](.githooks),
and `npm ci` does too, so a clone that installs is a clone with them on. Git
will not enable a hook out of a checkout on its own: that is a security
property rather than an oversight, and the reason this needs saying at all.

| Hook | What it runs | Cost |
| :-- | :-- | :-- |
| `pre-commit` | build, typecheck, the toolchain, docs, plans, private-reference, config and release checks, the tests, lint, `sf verify`, `sf check` | the fast half of the gate |
| `pre-push` | `npm run gate`, which is what CI runs | the whole gate |

Both take `--no-verify` when you know why. Neither is a substitute for
reading the finding: catching it here means your own machine tells you
before a pull request does.

`pre-commit` reads the working tree rather than the staged content, so a
deliberately partial commit is checked loosely. `pre-push` has the last word.

## What has to be green

```sh
npm run gate      # build, typecheck, the repository checks, docs, coverage, lint, knip, audit, sf check, sf verify
npm run e2e       # every scenario, driving the installed command; minutes, and needs bun
```

`npm run gate` is what CI runs, minus the scenarios. Run it before you open a
pull request; it is faster to be told by your own machine.

Some of it is worth understanding rather than obeying:

- **`npm run typecheck`** covers the *tests*, which `npm run build` does not:
  the build compiles `src` only, and vitest strips types without checking
  them. Without this step a test can reference a field that does not exist and
  stay green.
- **`npm run docs:check`** fails when the code moved and the generated half of
  the documentation did not, and when the written half breaks a prose rule (a
  hand-written count, a listed phrase, a page over its limit). Run
  `npm run docs:generate` and commit the result. Nobody writes a reference
  table here by hand; see
  [`docs/development/documentation.md`](docs/development/documentation.md).
- **`sf verify`** proves every enabled rule *fires*, by running it against a
  deliberately broken fixture. A rule that cannot fail is a rule that is
  lying, and this is what stops one existing.

## The gates, and the thing that will surprise you

Each **gate** pins a claim to a scenario that proves it, with the evidence
sealed by digest; [The gate](docs/development/the-gate.md) lists them and
counts them. A gate lists *activation paths*; touching one of
them makes its evidence stale, and `sf check` goes red until the scenario runs
again:

```
✗ critical L3.GATE_HAS_FRESH_EVIDENCE
    the implementation changed since gate `ticket-to-qa` was proven
```

That is not a bug: the proof was about code that no longer exists. Re-run and
re-seal:

```sh
./.software-factory/evidence/ticket-to-qa-scenario.sh
sf seal ticket-to-qa
```

Never hand-edit a digest. If the scenario cannot pass, the finding is the
product's behaviour, not the gate's.

## The one architectural rule

**The core knows no workflow and no plugin.** `packages/core` owns the
catalogue of actions and the contracts; a workflow composes them. There is a
local rule that fails the build on `from "@amykit/workflow-*"` or
`from "@amykit/plugin-*"` anywhere under `packages/core/src`, because this is the
invariant the whole plugin model rests on and it is one import away from being
lost.

Everything else follows from it:

```text
packages/core            contracts, the action catalogue, the registry
packages/workflow-testkit  the conformance kit a workflow's own suite runs
examples/workflow-*      the workflows amy ships: what happens next, and how.
                         Examples of what can be built, never needed to run
plugins/*                adapters. Depend on core, and on a workflow only for
                         the port types that workflow declares
packages/cli             the command. Nothing depends on it
```

Every package, with what it is, is in [Architecture](docs/concepts/architecture.md).

More follow from it, each a local rule that fails the build, all from
[an agent only answers](docs/design/an-agent-only-answers.md):

- **The agent port is `ask`.** A step (triage, implement, a review) is built
  on `ask` in the workflow, or with a helper from `agent-kit`. Never as a new
  method on the port.
- **An agent never touches git.** It answers. The workflow decides when the
  work is committed and when it is pushed.
- **Only the tracker speaks of tickets.** A port that is not the tracker takes
  what it needs (a workplace is `{ repo, workId }`), not a `Ticket`.
- **The core names no product and words nothing a person reads.** Linear,
  GitHub, Slack and Claude are plugins; titles and messages are the workflow's.

When one of these rules fires, its message says why the rule exists. Read it
before changing the code, and never loosen the rule to get past it: the rule
files are hash-locked, so loosening one shows up in the diff.

A **workflow** is a diagram, its decisions and its actions: `workflow.mmd`, the Mermaid diagram that says
*where* work can go and is the only place its states are written; `decide`, one
pure decision per drawn state that says *where it goes next*; and `actions`,
which say *how* it is done in the world. One `defineWorkflow` call joins them,
and a workflow with no diagram beside it does not mount. If you find yourself
wanting to `await` something inside a decision, the thing you want belongs in
an action. Purity is what lets a whole lifecycle be driven in a test in
milliseconds. Why it is one declaration:
[a workflow is one declaration](docs/design/a-workflow-is-one-declaration.md).

Writing one is [Write a workflow](docs/guides/write-a-workflow.md), or
`/amy-workflow` for an agent, and you do not need to be in this repository to
do it: a workflow is a package, and yours can live anywhere.

## Conventions that are not negotiable

- **A comment says why, not what.** There is a rule with a line ceiling on
  comment blocks; past a handful of lines a comment stops being read and
  starts being scrolled past. Reasoning that runs longer belongs in a
  document under `plans/` or `docs/` that the comment links to.
- **A test name is a sentence about behaviour.** `refuses a second claim`,
  where `test claim()` would say nothing.
- **Every workflow has a walkthrough test** that drives the whole lifecycle
  against a fake world and asserts the states in order, that one look makes at
  most one move, and that it settles instead of spinning. It is the test that
  finds the bugs; see [Testing](docs/build/testing.md).
- **A skipped test says why.** There is a rule for that too.
- **No `any`.** The message the rule gives you names the alternative.

## Changing behaviour

Every change that a user would notice needs a changeset:

```sh
npm run changeset
```

Write it for somebody reading the changelog long after: what changed, and
*why it was wrong before*. The existing ones in `.changeset/` are the
house style.

A change big enough to have a shape (a new lifecycle state, a new port, a
phase of work) gets a plan in `plans/`, listed in
[`plans/next-steps.md`](plans/next-steps.md). A plan is a declaration: YAML
frontmatter, its title, and at most a few lines of why. Every plan there is an
example; the shape is:

```yaml
---
sources:   [{ id: S1, kind: decision, said: "..." }]   # where each requirement comes from
touches:   ["packages/core/src/calls.ts"]               # what the work changes
untouched: ["plugins/file-worktree/**"]                 # only when one looks like it must change
criteria:  [{ id: A1, statement: "...", proof: "test:PATH", sources: [S1] }]
crosses:   [{ mechanism: engines, answer: works, proof: "test:PATH" }]  # or refused + by, n/a + why
guarantee: [{ holds: "...", not_against: "..." }]
failures:  [{ step: "...", when: "...", goes_to: "..." }]
cut:       ["... : refused at mount"]
exit:      "the externally visible effect that ends it"
---
```

`L4.PLAN_IS_A_LINKED_DECLARATION` holds it: every criterion names a source and
every source is named, and every mechanism in
[`docs/mechanisms.yaml`](docs/mechanisms.yaml) whose paths `touches` reaches
is answered under `crosses`. `npm run check:plans` adds that a plan in
`plans/` answers at least one crossing and declares a `guarantee` whose every
line names what it is `not_against`: that line is the review's scope, and a
failure outside it is a question for the person, not a fix. Prefer refusing a composition the work does not
need to supporting it: that is one `cut` line and one check at mount, not a
fix found in review. When a review finds a crossing no plan asked about, add
the mechanism to the catalog rather than a paragraph to the next plan.

A criterion that is a statement over every input (a merge keeps an explicit
zero, a retry with no evidence is refused, a second run changes nothing) is
proven by a property rather than by a handful of examples: `proof:
"property:PATH#FALSIFIER"`, where PATH is a fast-check test,
`tests/<topic>.property.test.ts`, and FALSIFIER is the implementation mutation
it must reject, planted only when `SF_FALSIFIER` names it. Every property runs
from the fixed seed in `scripts/properties.setup.ts`, so it decides the same
way on every machine. `L5.EVERY_PROPERTY_HAS_A_FALSIFIER` runs it both ways and refuses a property
that passes with its mutation planted. Until the work is built the file does
not exist, so the plan says which property it will be, the way it already
says `deferred:test:PATH`: `proof: "deferred:property:PATH#FALSIFIER"`, and
delivery drops the `deferred:`.

Before work on a plan starts, `sf ready plans/<plan>.md` says whether it still
matches the code; a plan that does not is fixed first, not worked around.

Once a plan's own file is in the change, it is in flight, and every file the
change edits has to be in its `touches`, under `deviations`, or one of the
files every change carries (the changeset, the changelog, `docs/manifest.json`).
`sf check` reads that change against `main` in the pre-commit hook, and CI
reads it against the pull request's base.

A plan is held to what it said. Grooming is a commit that touches only
`plans/` and `docs/mechanisms.yaml`; the first commit touching anything else
starts execution, and from then on a plan's declaration moves only
mechanically: to `docs/design/`, a criterion marked `done`, `deferred:`
dropped from a proof, a source pointed at a delivered note. Anything more (a
new `touches` entry, a `deviations` line, a reworded criterion) is grooming
again, from main. Why: [a plan is held to what it said](docs/design/a-plan-is-held-to-what-it-said.md). A plan groomed in the change is checked at its
base too: its `touches` are exact paths, never `**` and never twice; each
proof's file exists there or is touched; and every command named in
backticks, `` `amy workflow add ./w --into mine` ``, is one the CLI declares
there, or one an operation anywhere in the repository spells, mounted or
not, its input's fields the options, unless one of its criteria builds it.
A plugin's operation counts because [a plugin's command is a command too](docs/design/a-plugin-command-is-a-command-too.md).
`npm run check:plans` reads the change against `origin/main`, else `main`
(`PLANS_BASE` names another ref), with the working tree as one more commit.

## Where to ask

Open an issue. If something got in your way while working, an error message
that did not say enough or a step that needed retrying, that is what `amy note`
is for (when the `note-to-plan` workflow is mounted), and it becomes a plan in
this repository: [friction becomes a plan](docs/design/friction-becomes-a-plan.md).

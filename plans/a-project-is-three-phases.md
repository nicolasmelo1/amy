# A project is three phases, and amy reads them

A machine that drives work needs three things: decide what the work is, do it,
show it holds. amy is the middle one.

`Workflow` is a state machine, and the skill that helps somebody write one is
entirely about that machine — the purity of the decision, the seven
declarations, one walkthrough test driving the whole lifecycle against a fake
world. That walkthrough is the right test *for a state machine* and it is not a
test of anything the machine produced.

The consequence is measurable. Of fourteen tickets a grooming agent produced for
one feature, six were cancelled — none in the backlog, every one after code had
been written. A machine executing faithfully against a bad plan produces bad
work faster than a person would, and nothing in the lifecycle notices, because
every gate it passes is about the code it wrote rather than about whether that
code should exist.

## The contract

```
my-project/
  brief/        the grooming lifecycle: what the work is
  workflow/     the execution lifecycle: doing it
  test/         the proving lifecycle: showing it holds
```

A project declaring only `workflow/` is what exists today and keeps working
unchanged. That is the compatibility rule and it is what makes this additive
rather than a migration.

## Why a contract and not a convention

A convention nothing reads is prose. Two things follow only from the loader
knowing:

**Shared artifacts belong to the project, not to a profile.** The brief store is
built under the *profile's* state directory — the same separation that keeps two
profiles' queues apart. So a brief written by a grooming profile is invisible to
the execution profile that must read it at implement and self-review, which is
the entire point of the brief. Today the only way to share one is to write
`briefsDirectory: "../briefs"` in both and let the join resolve the `..`: state
holding configuration, which this repository refused once already when it moved
plugins out of wherever npm happened to put them.

**Phases differ in what they cost.** Grooming runs on a planning cadence and
wants an expensive model; execution runs continuously. Separate queues and
separate budgets is what profiles are for — and today choosing that costs you
the brief.

## What composes, and what does not yet

Two kinds of composition, and one of them is out of scope on purpose.

**Coupled by artifact.** The brief phase writes; execution and proving read. The
store already does this. What is missing is only *where* it lives.

**Coupled by call** — one workflow invoking another — is genuinely wanted and
much larger. A phase boundary that already works by artifact should not wait for
it.

## What stays out of the contract

Three slots, not three schemas. What a brief contains is the grooming workflow's
business and it will not be the same across projects: a workflow that reviews
code has a standing statement of a reviewer's habits where one that builds
features has a feature spec. A contract that fixed the *content* of a phase
would be wrong for the second workflow anybody writes. The core parses no
section today and does not start.

## Acceptance criteria

- [ ] A project laid out with the three directories mounts all three, and each
      is driven with its own queue and its own budget
      (proof: test:packages/cli/tests/project.test.ts)
- [ ] A project with only `workflow/` mounts exactly as it does today, with no
      config change and no new key
      (proof: test:packages/cli/tests/project.test.ts)
- [ ] A brief written by one phase is read by another phase of the same project,
      with no shared directory named in config and no path escaping a profile's
      state
      (proof: assertion:project.a_brief_crosses_the_phase_boundary)
- [ ] A phase directory that exists but exports no workflow is refused at boot,
      naming the directory
      (proof: test:packages/core/tests/mount.test.ts)
- [ ] The core reads no phase's content: a fixture whose sections are nonsense
      to every schema still mounts and still delivers
      (proof: test:packages/core/tests/Brief.test.ts)

**Exit condition:** one project drives grooming on a planning cadence with an
expensive model and execution continuously with a cheap one, the second reads
what the first wrote without either naming a path belonging to the other, and an
install that never heard of phases does not change.

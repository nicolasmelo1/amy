# The docs describe the contract that exists

The pages somebody reads to write their first plugin or workflow are
[Plugins](../docs/concepts/plugins.md), [Workflows](../docs/concepts/workflows.md),
[Ports](../docs/concepts/ports.md), [Write a plugin](../docs/build/write-a-plugin.md)
and [Write a workflow](../docs/build/write-a-workflow.md). Their generated
tables are right. Their prose has fallen behind the code in ways that make the
contract look heavier than it is:

- *Plugins* is headed "The five things a plugin can register", above a
  `Registry` with eight methods.
- *Workflows* is headed "The seven things a workflow declares", and one of the
  seven is `usesObservers`, which every workflow declares empty.
- Both open on an example with `version: "0.1.0"`, a field that no reader
  should copy.
- *Write a workflow* builds the workflow across seven files — state, record,
  effects, observation, machine, runtime, plugin — and says to read them as
  "what that directory looks like once the process is real". What
  `amy workflow new` writes is one `index.ts`, and the gate's own example of a
  workflow from outside this repository is 48 lines in one file. A reader
  takes the seven files as the price of entry.
- *Write a workflow*'s plugin step is the lazy proxy, the `WeakMap` and the
  `ready`, under the heading "two things there are load-bearing" — traps the
  author is asked to know about instead of things the host does.
- `@amykit/workflow-feature-grooming` is called a workflow, sits in the plugin
  index, registers two ports and no workflow, and no page says why.

[Nothing is declared twice](../docs/design/nothing-is-declared-twice.md),
[a mount builds once](../docs/design/a-mount-builds-once.md),
[a config is typed by its schema](../docs/design/a-config-is-typed-by-its-schema.md),
[the host lends the checkout](../docs/design/the-host-lends-the-checkout.md) and
[a workflow is one declaration](a-workflow-is-one-declaration.md) change the
contract these pages describe, so this comes after all five, and rewrites them
once against what exists.

## What changes

- **Write a workflow** starts from one file with one `defineWorkflow` call, and
  walks the five questions, the states, `plan()`, the runtime and the
  walkthrough test in that file. Splitting it is a closing section — when, and
  into what — not the shape of the page.
- **Write a plugin** starts from `definePlugin` with a typed config, and the
  deferred implementation is where it explains why plugin order does not
  matter.
- **Plugins** and **Workflows** lose every hand-written count. A list of what a
  `Registry` or a `Workflow` declares is generated from the type, like the
  tables below it already are, or it is prose without a number in it.
- **Ports** says what `checkouts()` is and which port it reads.
- `workflow-feature-grooming` is described as what it is. Whether it is renamed
  is a breaking change to every config that names it, and it gets its own plan
  if the answer is yes; this one only stops the docs from calling it something
  it is not.
- The mistakes table in *Write a workflow* loses every row the host now
  prevents, and keeps the ones it cannot.

## Acceptance criteria

- [ ] Every code block on the five pages typechecks against the current core
      (proof: deferred:test:scripts/docs/tests/examples.test.ts)
- [ ] No heading or sentence on the five pages states a count of members that
      is not generated
      (proof: deferred:test:scripts/docs/tests/examples.test.ts)
- [ ] The example *Write a workflow* builds is the one `amy workflow new`
      writes, and it runs before anybody edits it
      (proof: assertion:mine.the_scaffold_runs_before_it_is_edited)

**Exit condition:** somebody who has never seen this repository writes a
workflow from *Write a workflow* alone, in one file, and it mounts on the first
boot.

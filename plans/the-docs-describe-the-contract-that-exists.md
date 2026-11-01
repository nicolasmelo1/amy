---
sources:
  - { id: S1, kind: reference, ref: "docs/concepts/plugins.md", said: "was headed 'The five things a plugin can register' above a Registry with eight methods; the heading is now 'What a plugin can register', with no count. Done" }
  - { id: S2, kind: reference, ref: "docs/concepts/workflows.md", said: "the 'seven things' heading, usesObservers and the version: '0.1.0' examples are gone; 'the seven things' survives in its frontmatter description and in 'Writing one'. Left: those two" }
  - { id: S3, kind: reference, ref: "docs/build/write-a-workflow.md", said: "builds across seven files (state, record, effects, observation, machine, runtime, plugin) as 'what that directory looks like once the process is real'; amy workflow new writes one index.ts; the gate's outside example is one 48-line file" }
  - { id: S4, kind: reference, ref: "docs/build/write-a-workflow.md", said: "its plugin step was the lazy proxy, the WeakMap and ready under 'two things there are load-bearing'; those traps are gone from the page. Done" }
  - { id: S5, kind: reference, ref: "docs/start/quickstart.md", said: "lists discover, tick and start as if all were needed; start's loop already discovers on every pass (packages/cli/src/index.ts:643), and the page never says so" }
  - { id: S6, kind: code, ref: "packages/workflow-feature-grooming", said: "called a workflow; the catalogue and plugins.md now list it as a plugin registering grooming-source and grooming-tracker, but no page says why its name says workflow" }
  - { id: S7, kind: decision, said: "the generated tables are right; the prose fell behind the code and makes the contract look heavier. This comes after the ten design docs below and rewrites the pages once against what exists" }
  - { id: S8, kind: reference, ref: "docs/design/nothing-is-declared-twice.md", said: "changes the contract" }
  - { id: S9, kind: reference, ref: "docs/design/a-mount-builds-once.md", said: "changes the contract" }
  - { id: S10, kind: reference, ref: "docs/design/a-config-is-typed-by-its-schema.md", said: "changes the contract" }
  - { id: S11, kind: reference, ref: "docs/design/the-host-lends-the-checkout.md", said: "changes the contract" }
  - { id: S12, kind: reference, ref: "docs/design/a-workflow-is-a-mermaid-diagram.md", said: "changes the contract" }
  - { id: S13, kind: reference, ref: "docs/design/a-workflow-is-one-declaration.md", said: "changes the contract" }
  - { id: S14, kind: reference, ref: "docs/design/a-workflow-is-three-pieces.md", said: "changes the contract" }
  - { id: S15, kind: reference, ref: "docs/design/waiting-is-not-trying.md", said: "changes the contract" }
  - { id: S16, kind: reference, ref: "docs/design/a-workflow-calls-another.md", said: "changes the contract" }
  - { id: S17, kind: reference, ref: "docs/design/a-workflow-runs-on-lanes.md", said: "changes the contract" }
  - { id: S18, kind: decision, said: "Write a workflow starts from workflow.mmd and one defineWorkflow call, teaching the diagram (where work can go), decide (where next), actions (what happens), then before, after and the walkthrough" }
  - { id: S19, kind: decision, said: "every step works without the CLI; amy workflow new is named as the shortcut writing the same two files. Splitting into files is a closing section (when, into what), not the page's shape" }
  - { id: S20, kind: decision, said: "Write a plugin starts from definePlugin with a typed config; the deferred implementation is where it explains why plugin order does not matter" }
  - { id: S21, kind: decision, said: "Plugins and Workflows lose every hand-written count: a list of what a Registry or Workflow declares is generated from the type, like the tables below, or is prose with no number" }
  - { id: S22, kind: decision, said: "Ports says what checkouts() is and which port it reads" }
  - { id: S23, kind: reference, ref: "plans/a-plugin-brings-its-own-commands.md", said: "Quickstart says amy start alone is enough; tick, which discovers first once this plan lands, is how somebody watches one move before trusting the loop" }
  - { id: S24, kind: decision, said: "workflow-feature-grooming is described as what it is; the docs stop calling it something it is not" }
  - { id: S25, kind: decision, said: "Write a workflow's mistakes table loses every row the host now prevents and keeps the ones it cannot" }
touches:
  - docs/concepts/plugins.md
  - docs/concepts/workflows.md
  - docs/concepts/ports.md
  - docs/build/write-a-plugin.md
  - docs/build/write-a-workflow.md
  - docs/start/quickstart.md
  - docs/catalog/index.md
  - scripts/docs/tests/examples.test.ts
criteria:
  - { id: A1, statement: "every code block on the five pages typechecks against the current core", proof: "deferred:test:scripts/docs/tests/examples.test.ts", sources: [S2, S4, S7, S8, S9, S10, S11, S12, S13, S14, S15, S16, S17, S20, S22] }
  - { id: A2, statement: "no heading or sentence on the five pages states a count of members that is not generated", proof: "deferred:test:scripts/docs/tests/examples.test.ts", sources: [S1, S2, S21] }
  - { id: A3, statement: "the example Write a workflow builds is the one amy workflow new writes, and it runs before anybody edits it", proof: "assertion:mine.the_scaffold_runs_before_it_is_edited", sources: [S3, S5, S6, S18, S19, S23, S24, S25] }
cut:
  - "renaming workflow-feature-grooming: a breaking change to every config naming it; its own plan if the answer is yes"
exit: "somebody who has never seen this repository writes a workflow from Write a workflow alone, as a diagram and one file, and it mounts on the first boot"
---
# The docs describe the contract that exists

The pages somebody reads to write a first plugin or workflow have prose that fell behind the code, making the contract look heavier than it is.

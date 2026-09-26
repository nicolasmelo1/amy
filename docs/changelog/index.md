---
title: News
description: What shipped, and what is about to.
group: News
order: 1
---

# News

Every release, and everything written down and not released yet.

The released half comes from the releases on GitHub, cached into this repository
so that building the documentation never needs a network. The unreleased half
comes from the changesets in the working tree, which is the only one of the two
that exists before a release does.

```sh
npm run docs:changelog     # refresh the cache from GitHub
```

## Coming next

<!-- amy:generated changelog-unreleased -->

### Preparing a branch no longer erases a commit the machine made and could not push. `Git.prepareBranch` used `checkout -B`, which reset an existing local branch onto the remote branch or the base, so a commit whose push had failed was gone at the next look with nothing to say it existed. A branch that does not exist locally is still created from the remote branch, or from the base when the remote has none. When the remote is ahead of the branch, it is fast-forwarded. When the branch holds commits the remote lacks, it is kept as it is. One that diverged from its remote is refused, and the error names the commits only the local side holds. `Git.commitAndPush` now also pushes such a commit when the tree is clean, and returns true when it does.

`patch` · `@amykit/core`



### `findPrivateReferences` reads a tree against a policy of hashed terms, so the repository gate can refuse a private name — standing alone or glued into a longer identifier — without the list of forbidden names being published alongside the check that hides them.

`patch` · `@amykit/cli`



### `classify` turns a plugin spec into what npm installs and what the config names — a name, a range, a git URL, a tarball or a path — in one place, before `amy add`, `amy remove` and `amy update` arrive.

`minor` · `@amykit/cli`



### `@amykit/workflow-testkit` is new: `conforms(workflow, { runner, runtime, worlds })` registers the machine-shaped suite every workflow needs and nobody writes — every state reached and left, every planned action handled and surviving the call, no wait counted as a try, no decision made by `[].every(...)`, and no giving-up state without an honest way out — as ordinary tests in whichever runner it is handed, driven against worlds the author supplies. `amy workflow new` now writes that suite beside the scaffold as `index.test.js`, with `npm test` and the kit as a dev dependency, and the scaffold's `index.js` exports its `workflow` and a `runtime()` factory beside the plugin.

`minor` · `@amykit/cli`, `@amykit/workflow-testkit`



### `amy workflow new` writes an editable workflow under the machine state home, and `amy workflow check` drives its lifecycle before it reaches real work.

`minor` · `@amykit/cli`



### `amy doctor` and `amy plugin list` resolve a workflow of your own the same way mounting does, so `amy plugin list` no longer reports a directory written by `amy workflow new` as `FAIL`, and doctor validates its settings against the schema it declares.

`patch` · `@amykit/cli`



### A workflow now declares the code-host writes it may make, and the mount gives its runtime capability-limited tracker and code-host ports. `amy doctor` reports the selected workflow's external write surface, including tracker/code-host read-only installs.

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/workflow-errand`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-ticket-to-qa`



### New `amy add` and `amy remove` commands: one argument — a package name, a URL, a git URL or a path — installs the package into `~/.amy/plugins`, mounts it alone to decide whether it is a workflow or a plugin, writes the config entry (a profile for a workflow, the machine-wide `extraPlugins:` list for a plugin), and refuses what the machine would not survive instead of leaving a half-added entry behind. Plugins added this way join a profile without freezing its recommended set into the config.

`minor` · `@amykit/cli`



### New `amy update` command: moves a machine forward without leaving it half-updated — reads both roots (the plugins root and the one that resolved the CLI), re-resolves every registry range through npm, installs the exact version each range now points at, and keeps the manifest's ranges the way the operator wrote them. Refuses while the loop is running; a version that will not import or mount is rolled back to the one that did; a config that will not boot fails the update and rolls back every move; and when the CLI itself moves, its skills are rewritten into the harnesses they were written into before — through the new CLI, never the old process. `amy skills` now records where it wrote, and `--recorded` rewrites into exactly those places.

`minor` · `@amykit/cli`



### Schedule `amy update` around workflow invocations with a persisted per-profile cadence. The default updates before every twentieth invocation; operators can run after, disable it, and receive an early refusal for invalid schedule settings. Daemons update only before their child starts or after it exits.

`minor` · `@amykit/cli`



### Plugins configured for an amy install now live in `~/.amy/plugins`: `amy init --install` installs them through that root rather than npm's global prefix, and mounting plus `amy plugin list` resolve from the same root.

`minor` · `@amykit/cli`



### The config template and the `/amy-workflow` skill say that a workflow of your own lives in `~/.amy/workflows`, instead of naming `amy add`, a command nothing ships, and telling a harness to install a package it does not need.

`patch` · `@amykit/cli`



### `amy workflow new` now writes TypeScript: `index.ts` typed against `@amykit/core`, run unbuilt by Node 22.18 or later from `~/.amy/workflows`, with a `tsconfig.json` and `build`/`typecheck` scripts that compile `dist/` for publishing, since Node refuses TypeScript under `node_modules`; the suite is `index.test.ts`. A local workflow that is still `index.js` keeps resolving. It also writes a `.software-factory/` beside the scaffold: three repo-local rules that `sf check` in the workflow's directory enforces — no `checkout -B`, which loses a commit that was never pushed; no fold reading `.state` off the record the engine already moved; and no `.every(` that does not say what an empty collection means — with one mutation fixture each, so `sf verify` there proves every rule still fires. amy does not install `sf`, and `sf` learns nothing about amy: they are ordinary local rules.

`minor` · `@amykit/cli`



### **Breaking for workflow authors — one migration for two changes.**

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-serial-engine`, `@amykit/workflow-errand`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-testkit`, `@amykit/workflow-ticket-to-qa`

An action is declared once. `WorkflowRuntime.handlers()` and `Workflow.usesActions` are replaced by `WorkflowRuntime.actions`: a map whose keys are the actions the plan may emit and whose values run them — a handler, or `{ port, method }` for a method its port marked with the new `acceptsAction`, which the host calls with the action and its context and whose answer lands in `outcomes` under the action's name. The mount refuses at boot, by name, a key with nothing behind it, a port nothing mounted, a method the port lacks, or one that takes its own arguments rather than an action; the engine refuses a plan carrying an undeclared action before any of its actions run. A package still carrying `usesActions` or `handlers()` is refused with the sentence that says what to change.

`apply` is told the move: `apply(record, plan, outcomes, observation, now, moved)`, where `moved` is `{ from, to }` for an advance and `null` otherwise. `record` has already moved, so where the work came from is `moved.from`, never `record.state`. `movedBy`, `runAction`, `implementationOf`, `undeclaredIn`, `unrunnable`, `mountedActions` and `mountedRuntime` are exported from the core.

`ticket-to-qa` now resumes an answered escalation in the state that raised it — implementing, the gate, an automated or human fix, or reviewer assignment — instead of always in `HUMAN_FIX`, and starts its attempt counters again when it does. `@amykit/workflow-testkit` takes a `ports` option for actions declared as a port and a method, and `amy workflow new` scaffolds the new shape.

<!-- amy:end changelog-unreleased -->

## Released

<!-- amy:generated changelog-releases -->

No release has been cut yet. The release workflow is deliberately dormant until
somebody arms it, so this is the truth rather than a fetch that failed —
see [the release path](../development/releasing.md).

<!-- amy:end changelog-releases -->

## Per-package changelogs

Each package carries its own `CHANGELOG.md`, written by `changeset version`. The
news above is the whole workspace; a package's own file is the one to read when
you depend on exactly that package.

## How a change gets here

Every change a user would notice needs a changeset:

```sh
npm run changeset
```

Written for somebody reading it six months from now: **what changed, and why it
was wrong before.** A changelog entry that says what the diff says is one nobody
gains anything from reading.

See [Releasing](../development/releasing.md).

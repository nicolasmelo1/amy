# Nothing is declared twice

Two things a plugin or a workflow declares today are either a copy of a fact
that lives somewhere else, or a promise nothing keeps.

**`Plugin.version`.** Every plugin in `plugins/*`, every package in
`packages/workflow-*`, the host's own plugin (`packages/cli/src/hostPlugin.ts`),
both places the scaffold writes one (`packages/cli/src/workflow.ts`) and the
installed fixture `workflow-oncall` declare `version: "0.1.0"`. Every one of
those packages is `0.6.0` in its `package.json`. Nobody bumped the literal,
because nothing makes anybody: the field is read in two places. `mount()`
copies it into `Mounted.plugins` (`packages/core/src/mount.ts`), where the only
reader takes `.length`; and `amy plugin list` prints it, so the one place it is
ever shown says `0.1.0` on an install that is `0.6.0`. The package manifest is
already the version, and the release tooling already moves it.

**`Workflow.usesObservers`, `Registry.observer()` and `ObservationSource`.**
All three shipped workflows and the scaffold declare `usesObservers: []`.
Nothing in this repository calls `registry.observer(`. The mount still checks
the list, still carries a refusal for an observation nothing contributes, and
the generated workflow tables still print an "Observations it reads" row that
says _none_ for every workflow there is. The runtime's own `observe()` is a
different thing, used by every workflow, and stays exactly as it is.
[Actions](../concepts/actions.md) holds that a capability graduates into
the core by evidence rather than guess; this one has had no evidence since it
was written.

## What changes

- `Plugin` loses `version`. `Mounted.plugins` carries names only.
- `amy plugin list` reads the version out of the `package.json` of the package
  it resolved. A workflow directory under `~/.amy/workflows` has one, because
  the scaffold writes one; a bare path with none prints no version rather than
  a made-up one.
- `Workflow` loses `usesObservers`; `Registry` loses `observer`; the core loses
  `ObservationSource`, `Mounted.observers` and the refusal that read them. The
  generated workflow table loses its observations row.
- Every shipped plugin, workflow, the scaffold and the `workflow-oncall`
  fixture drop the lines.

Removed, not deprecated. A field that is read nowhere and wrong everywhere is
not worth a release of warnings, and an object literal typed `Plugin` that still
carries `version` fails to compile, which tells its author the one line to
delete. The changeset says so in one sentence.

It ships in the same release as
[a workflow is one declaration](a-workflow-is-one-declaration.md), so somebody
who wrote a workflow migrates once.

## Acceptance criteria

- [x] `amy plugin list` prints, for each installed package, the version its
      own `package.json` declares, and no version for a path that has none
      (proof: test:packages/cli/tests/plugin-list.test.ts)
- [x] An object literal typed `Plugin` that declares `version` fails to
      typecheck, and one typed `Workflow` that declares `usesObservers` does
      too
      (proof: test:packages/core/tests/plugin-contract.test.ts)
- [x] The mount no longer knows the word observation: nothing registers one,
      nothing is refused for lacking one, and `Mounted` carries none
      (proof: test:packages/core/tests/mount.test.ts)
- [x] The installed `workflow-oncall` fixture, with both lines gone, still
      mounts from outside this repository and is driven by the engine
      (proof: assertion:plugins.a_workflow_from_outside_this_repository_mounts)
- [x] The scaffold writes neither line, and what it writes still runs before
      anybody edits it
      (proof: assertion:mine.the_scaffold_runs_before_it_is_edited)

**Exit condition:** `grep -rn "version: \"0.1.0\"\|usesObservers" plugins
packages --include=*.ts` outside `dist/` finds nothing, and `amy plugin list`
on a `0.6.0` install says `0.6.0`.

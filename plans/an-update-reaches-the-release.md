# An update reaches the release

From [#110](https://github.com/nicolasmelo1/amy/issues/110). The first machine
to move from 0.5.0 to 0.6.0 ran `amy update` with every `@amykit/*` package
already published at 0.6.0, and was told:

```
20 package(s) in the plugins root (running from a checkout, so no CLI half to move)
  @amykit/plugin-agent-relay  0.5.0 -> 0.5.0  (plugins, ^0.5.0)
  ...
nothing to move
```

It took three commands by hand: `npm i -g @amykit/cli@0.6.0`, an
`npm install --prefix ~/.amy/plugins` naming nineteen packages, and
`amy doctor`. The command exists so that nobody has to do that, and the
`amy-update` gate is green.

## Two defects, and why the gate passed both

**A 0.x range never reaches the next release.** `amy update` re-resolves the
range the plugins root's manifest holds. `amy init` installs through npm, npm
saves `^0.5.0`, and on 0.x a caret holds the minor. While this project is on
0.x every release is a minor, so `update` can only ever move a patch, and
auto-update runs the same `update`, so it never moves a release either.

**A CLI installed with `npm i -g` reads as a checkout.** `roots()`
(`packages/cli/src/update.ts:190`) accepts an install root only when a
`package.json` sits beside the `node_modules` holding the CLI. A global npm
prefix (`<prefix>/lib/node_modules/@amykit/cli`, or
`<prefix>/node_modules/@amykit/cli` on Windows) has none. So `update` skips
the CLI on the install every guide tells people to make.

**The gate could not see either.** `amy-update-scenario.sh` puts a stand-in
`npm` on the PATH whose `view` ignores the range it is asked about: it answers
`999.0.0` for the CLI, and the contents of `registry-answer` for the workflow.
Its workflow lives at 1.x, where a caret does cross minors. And it installs the
CLI through `scripts/install.sh` into a root that has a `package.json`, never
with `npm i -g`. Range resolution and the global layout are exactly the two
things the scenario stubs out, so a regression in either one passes.

That is the part worth a plan rather than a patch: the fix is small, but a
proof that cannot fail looks the same as one that protects you.

## What changes

**First-party packages move as one release.** `.changeset/config.json`
releases `@amykit/*` as one `fixed` group, so the packages always share a
version, and an install holding two of those versions is half-updated by
definition. `update` resolves the release once, from the CLI's registry intent
(`latest` unless the operator wrote another), and moves every `@amykit/*` in
both roots to that exact version, whatever caret npm saved. Afterwards it
rewrites each manifest entry to `^<new version>`, so the root keeps naming the
release it is on. Third-party packages keep the range the operator wrote, and
a 0.x third-party workflow at `^0.1.0` does not jump to 0.2.0. That is the
operator's call, not ours.

**A global prefix is an install root.** When no `package.json` sits beside it,
`roots()` asks npm for its global root (`npm root -g`, run once) and compares
real paths. If the CLI lives there, the install root is global, and the CLI
moves with `npm install -g @amykit/cli@<exact>` and rolls back with the
version it had. Any other layout is still a checkout. A checkout is something
`update` must never install over.

**One release, or none.** If the CLI moved and a plugin then refuses to import,
or a profile then refuses to mount, every move is rolled back, CLI included.
The result can never be a 0.6 CLI over 0.5 plugins. That is the promise the
command's description already makes.

**`--check` names the release.** When a newer release exists that `update`
would move to, `--check` reports it as one line naming both versions. When the
operator has pinned the CLI's intent below it, `--check` says so by name
instead of `nothing to move`.

**The scenario gets a real registry.** The stand-in `npm` goes away. In its
place, the scenario starts a static registry on a loopback port: one TypeScript
script, run by tsx, that serves a packument and tarballs per package, built from tarballs
the scenario packed itself, with integrity computed from them. Real npm talks
to it through `--registry`, so npm's own semver resolves every range and npm's
own `-g` writes the global layout. It still needs no network and no
credential, and the port is whatever the kernel hands out, so two runs cannot
collide.

The registry publishes the CLI and every `@amykit/*` package the scenario
needs at the version this checkout builds, and again restamped at the next
0.x minor. It also publishes a third-party workflow at `0.1.0` and `0.2.0`,
plus the existing `@acme/workflow-oncall` versions.

## Acceptance criteria

- [ ] A machine whose plugins root holds `^0.<n>.0` (what npm saves) and whose
      registry publishes `0.<n+1>.0` moves every `@amykit/*` package in both
      roots to `0.<n+1>.0` in one `amy update`
      (proof: assertion:update.a_release_crosses_the_minor)
- [ ] After that update, every `@amykit/*` package on disk in either root
      reports the same version, and each manifest entry names it
      (proof: assertion:update.one_release_on_disk)
- [ ] A third-party workflow at `^0.1.0` stays at 0.1.0 while 0.2.0 is
      published, in the same run, so the registry is proven to resolve ranges
      rather than answer whatever it holds
      (proof: assertion:update.a_third_party_range_is_honoured)
- [ ] A CLI installed with `npm install -g` is the install root, `--check`
      names its move, and `update` moves it in the global prefix
      (proof: assertion:update.a_global_cli_is_an_install_root)
      (proof: assertion:update.a_global_cli_moves)
- [ ] The global CLI it moved runs at the new version from the same
      executable path the operator types, and rewrites its own skills
      (proof: assertion:update.a_moved_global_cli_still_runs)
- [ ] A release whose plugin refuses to import rolls back every move, the
      global CLI included, and leaves one version on disk: the old one
      (proof: assertion:update.a_refused_release_rolls_back_whole)
- [ ] `--check` names the release it would move to, and names an operator's
      pin that holds the CLI below it, instead of `nothing to move`
      (proof: assertion:update.a_check_names_the_release)
- [ ] A checkout is still never installed over, and the global-root question
      is asked of npm at most once per update
      (proof: test:packages/cli/tests/update.test.ts)
- [ ] The global layouts of both platforms are recognised, `lib/node_modules`
      and Windows' `node_modules` directly under the prefix
      (proof: test:packages/cli/tests/update.test.ts)
- [ ] Auto-update, running before a workflow, moves the same release the
      command does
      (proof: assertion:update.auto_update_reaches_the_release)

## The gate

These go into `amy-update`'s `required_assertions`, and into
`docs/design/amy-update.md` when the plan is delivered, which the plan board
requires:

```yaml
      - "update.a_release_crosses_the_minor"
      - "update.one_release_on_disk"
      - "update.a_third_party_range_is_honoured"
      - "update.a_global_cli_is_an_install_root"
      - "update.a_global_cli_moves"
      - "update.a_moved_global_cli_still_runs"
      - "update.a_refused_release_rolls_back_whole"
      - "update.a_check_names_the_release"
      - "update.auto_update_reaches_the_release"
```

The activation grows by the files these assertions rest on, so a change to any
of them expires the proof:

```yaml
      - ".changeset/config.json"            # the fixed group lockstep rests on
      - "scripts/install.sh"
      - "scripts/write-install-manifest.ts"
      - ".software-factory/evidence/amy-update/registry.ts"
```

**It must fail before it passes.** The pull request runs the new scenario
against the commit before the fix. Every assertion above that names a
behaviour must come back `failed` there, and the run report goes in the pull
request. If one passes against the old code, that assertion is not observing
what it names, and the work is not done.

**It must not pass a lying registry.** `a_third_party_range_is_honoured` is
the canary for the registry itself. A registry that answered the newest
version for every range would move the 0.x workflow to 0.2.0 and turn that
assertion red. So the stand-in cannot quietly drift back to what the old one
did.

**Exit condition:** a machine on the last release, with its CLI installed by
`npm install -g`, runs `amy update` once and ends on the current release in
both roots, one version throughout. The gate goes red the day the scenario's
registry stops resolving ranges or the scenario stops installing globally.

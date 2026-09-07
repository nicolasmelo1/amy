# `amy update`

There is no way to move an install forward. A new version of a workflow means
finding where it was installed, running npm there by hand, and remembering
that the skills amy wrote into `~/.claude/skills` came from the old CLI and
are now describing subcommands that may not exist — `install()` overwrites
them deliberately for exactly that reason (`harnesses.ts:36`), and nothing
calls it after the first time.

That last one is the failure worth naming, because it is silent and it lands
on an agent rather than on a person: a skill telling a harness to run
`amy add` on an install that predates it produces a confident wrong answer,
not an error.

## What changes

```sh
amy update                 # everything in both roots
amy update @acme/workflow-oncall
amy update --check         # what would move, and to what
```

It reads the two roots, resolves what the ranges in them now point at, and
reports one line per package: name, the version installed, the version it
would move to. `--check` stops there. Otherwise it installs, then re-mounts
every configured profile before saying it worked — an update that leaves a
config that cannot boot has not worked, and finding that out at the next tick
means finding it out from the daemon.

Two refusals. It will not run while the daemon holds `daemon.pid`, because
swapping a package under a running loop is the one thing that turns a
deterministic machine into a flaky one. And a package that fails to mount at
the new version is rolled back to the version that did, which is knowable
because the old one was resolvable a second ago.

When `@amykit/cli` itself moves, the skills are rewritten into every harness
they were written into before. Which harnesses those were is a fact about this
machine, so it is recorded in `~/.amy` when `amy skills` runs rather than
guessed from what is installed now.

## The gate

New: `amy-update`, with a scenario in
`.software-factory/evidence/amy-update-scenario.sh`, joined to `npm run e2e`.
Activation on `packages/cli/src/update.ts`, `packages/cli/src/skills.ts`,
`packages/cli/src/harnesses.ts`.

The scenario packs the third-party workflow twice, at two versions, into a
directory used as a registry. It installs the first, drives one move, updates,
drives another, and asserts the version that moved and the record that did
not. No network, no credential.

## Acceptance criteria

- [ ] `--check` names every package that would move, and moves nothing
      (proof: assertion:update.a_check_changes_nothing)
- [ ] An update moves the version and keeps records, queue and log
      (proof: assertion:update.the_state_survives_the_version)
- [ ] Every configured profile is mounted before the update is called done
      (proof: assertion:update.a_config_that_stops_booting_fails_the_update)
- [ ] A version that will not mount is rolled back to the one that did
      (proof: assertion:update.a_bad_version_is_rolled_back)
- [ ] An update refuses while the loop is running, naming the pid
      (proof: test:packages/cli/tests/update.test.ts)
- [ ] Updating the CLI rewrites its skills into the harnesses it wrote to
      before (proof: assertion:update.the_skills_follow_the_version)
- [ ] A harness that was never written to is not written to now
      (proof: test:packages/cli/tests/skills.test.ts)

**Exit condition:** a machine two versions behind runs one command, ends up on
the current one with its work untouched, and the skills in its harnesses
describe the CLI that is now installed.

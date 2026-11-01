# Amy update

There was no way to move an install forward. A new version of a workflow
meant finding where it was installed, running npm there by hand, and
remembering that the skills amy wrote into `~/.claude/skills` came from the
old CLI and were now describing subcommands that may not exist —
`install()` overwrites them deliberately for exactly that reason, and
nothing called it after the first time.

That last one was the failure worth naming, because it is silent and it
lands on an agent rather than on a person: a skill telling a harness to
run a command an install no longer has produces a confident wrong answer,
not an error.

## What shipped

One command, `amy update`, which reads the two roots a machine keeps — the
plugins root under `~/.amy/plugins`, and the install root that resolved the
CLI itself, derived from where this running CLI loaded from rather than
from any config, because the fact about this machine is the resolution
itself. `--check` names what would move; the move names what it did.

**Ranges move; pins do not.** A bare name, a semver range or `latest` is a
registry range and `update` answers for it through `npm view`. A `file:`
spec, a URL, a git form or a path is a pin — what it names is one place on
one machine — and the report says `pinned` rather than pretending a
registry question could fail. The move installs the **exact version** the
range points at, never the range: npm is free to answer a range with
whatever already satisfies it, which on a machine whose lockfile still holds
the old version is the old version — a no-op that reads as success. After
the install, the manifest entry is put back to the range the operator
wrote, because the root's manifest is the record of *why* the package is
there; the copy on disk is today's answer to it.

**The order is the order of an undo.** The loop is refused first, naming
the pid: swapping a package under a running loop is the one thing that
turns a deterministic machine into a flaky one. Each move installs, probes
the copy npm just wrote (a version that will not import, or exports no
`plugin`, is a bad version), and rolls back to the version that was on
disk — knowable, because it was resolvable a second ago. After every move
lands, every configured profile is mounted, not only the selected one: a
profile the operator has not driven this week is still one the next tick
may pick. A config that will not boot fails the update and rolls back every
move, rather than succeeding over a config the daemon would refuse. The
boot check runs even when nothing moved — an update on a machine whose
config is already broken must say so, not report success.

**The skills follow the CLI.** When `@amykit/cli` itself moves, its skills
are rewritten into every harness they were written into before — through
the *new* CLI, spawned to run `skills --recorded`, never the old process,
which would write the old bodies: the exact failure this command exists to
end. Which harnesses those were is a fact about this machine, recorded in
`~/.amy/skills-written.json` when `amy skills` runs, not guessed from what
is installed now. A harness that was never written to is not written to
now; a directory that is gone is skipped, not recreated.

## An update reaches the release

From [#110](https://github.com/nicolasmelo1/amy/issues/110): the first
machine to move from 0.5.0 to 0.6.0 ran `amy update` with every package
published at 0.6.0 and was told `nothing to move`. Two defects did it, and
the gate passed both because its stand-in npm stubbed out exactly the two
things they were about.

**First-party packages move as one release.** `@amykit/*` is released as one
fixed group, so a machine holding two of its versions is half-updated by
definition. `update` asks the registry once for the release — the CLI's
registry intent, `latest` unless the operator wrote another — and moves every
`@amykit/*` package in both roots to that exact version, whatever caret npm
saved: on 0.x a caret holds the minor, and every 0.x release is a minor.
Each manifest entry is then written as `^<release>`, so the root names the
release it is on. A first-party copy already past the release is held, never
moved back. Third-party packages keep the range the operator wrote, and a 0.x
workflow at `^0.1.0` stays on 0.1.0 with 0.2.0 published: that is the
operator's call. The intent is read from `amyUpdateRanges["@amykit/cli"]` in
`~/.amy/plugins/package.json` first — the one manifest a global install has —
then from the install root's.

**A global prefix is an install root.** A CLI installed with `npm i -g` has
no manifest beside its `node_modules`, so it read as a checkout and `update`
never moved it. Now, when no manifest is there, npm is asked for its global
root — once — and a match by real path makes the prefix the install root:
`<prefix>/lib/node_modules` on Unix, `<prefix>\node_modules` on Windows. The
CLI moves with `npm install --global --prefix <prefix>` and rolls back the
same way. Anything else is still a checkout, which `update` never installs
over, and a checkout never asks npm at all.

**One release, or none.** A plugin that refuses to import, or a profile
that refuses to mount, rolls back every move, the global CLI included, and
each manifest entry goes back to what it said before the update.

**`--check` names the release** in one line, `release 0.6.0 -> 0.7.0`, and
an operator's intent that holds the CLI below a newer release is named
instead of `nothing to move`.

## The proof

New gate `amy-update`, whose scenario builds a scratch machine two
versions behind: the CLI installed with `npm install -g`, then a third-party
workflow at 1.0.0 installed through a registry that later gains 1.1.0 (good)
and 1.2.0 (which exports no `plugin`). The registry is real to npm: a static
one on a loopback port serving tarballs the scenario packed, so npm's own
semver resolves every range and npm's own `-g` writes the global layout.
It then gains the next 0.x release of every `@amykit/*` package three
times — one whose plugin refuses to import, one good, and one more that
auto-update reaches before a workflow runs. The machine drives work at the old
version, `--check` names the move and changes nothing, the update moves
the version and keeps the record byte for byte, the new version drives
work with its own reason, the bad version is rolled back with the refusal
named, a config that stops booting fails the update and the move with it,
the loop's pid is named in the refusal, and the skills are rewritten into
the harness they were written into and no other. No network, no
credential.

## Acceptance criteria

- [x] The machine two versions behind is built the way a real one was: the
      workflow added at its first version, and one move driven on it
      (proof: assertion:update.added_the_first_version)
      (proof: assertion:update.the_installed_cli_keeps_a_registry_intent)
      (proof: assertion:update.v1_moves_the_page)
      (proof: assertion:update.v1_finds_the_page)
- [x] `--check` names every package that would move, and moves nothing
      (proof: assertion:update.a_check_names_what_would_move)
      (proof: assertion:update.a_check_changes_nothing)
- [x] An update moves the version on disk and keeps records, queue and log
      (proof: assertion:update.the_version_moved)
      (proof: assertion:update.the_copy_on_disk_moved)
      (proof: assertion:update.the_state_survives_the_version)
      (proof: assertion:update.the_manifest_keeps_the_range)
- [x] The new version drives the work it finds, with its own reason, and
      the machine boots after the update
      (proof: assertion:update.the_new_version_drives_the_work)
      (proof: assertion:update.the_machine_boots_after_the_update)
- [x] Every configured profile is mounted before the update is called done
      (proof: assertion:update.a_config_that_stops_booting_fails_the_update)
      (proof: assertion:update.the_boot_refusal_rolls_the_move_back)
- [x] A version that will not mount is rolled back to the one that did
      (proof: assertion:update.a_bad_version_is_rolled_back)
      (proof: assertion:update.the_rollback_names_the_reason)
- [x] An update refuses while the loop is running, naming the pid
      (proof: assertion:update.an_update_refuses_while_the_loop_runs)
      (proof: test:packages/cli/tests/update.test.ts)
- [x] Updating the CLI rewrites its skills into the harnesses it wrote to
      before
      (proof: assertion:update.the_skills_follow_the_version)
      (proof: assertion:update.skills_writes_are_recorded)
- [x] A harness that was never written to is not written to now
      (proof: assertion:update.a_harness_never_written_to_is_not_written_to_now)
      (proof: test:packages/cli/tests/update.test.ts)
- [x] The installed CLI drives default, after, cadence, disabled, invalid and
      daemon scheduling; a direct `daemon` follows the configured schedule too
      (proof: assertion:update.default_auto_update_runs_before_a_workflow)
      (proof: assertion:update.auto_update_can_run_after_a_workflow)
      (proof: assertion:update.auto_update_respects_its_cadence)
      (proof: assertion:update.auto_update_can_be_disabled)
      (proof: assertion:update.invalid_auto_update_settings_refuse_before_work)
      (proof: assertion:update.a_daemon_updates_only_at_its_lifecycle_boundary)
      (proof: assertion:update.direct_daemon_uses_the_configured_schedule)
- [x] The CLI moves itself the same way it moves a workflow, and the moved
      CLI runs and rewrites its own skills
      (proof: assertion:update.the_cli_moves_itself)
      (proof: assertion:update.a_moved_cli_still_runs)
      (proof: assertion:update.a_moved_cli_rewrites_its_own_skills)
- [x] A machine whose plugins root holds `^0.<n>.0` and whose registry
      publishes `0.<n+1>.0` moves every `@amykit/*` package in both roots to
      it in one `amy update`, and each manifest entry names it
      (proof: assertion:update.a_release_crosses_the_minor)
      (proof: assertion:update.one_release_on_disk)
- [x] A third-party workflow at `^0.1.0` stays at 0.1.0 while 0.2.0 is
      published, so the registry is proven to resolve ranges
      (proof: assertion:update.a_third_party_range_is_honoured)
- [x] A CLI installed with `npm install -g` is the install root, moves in the
      global prefix, and runs at the new version from the same path, writing
      its own skills
      (proof: assertion:update.a_global_cli_is_an_install_root)
      (proof: assertion:update.a_global_cli_moves)
      (proof: assertion:update.a_moved_global_cli_still_runs)
- [x] A release whose plugin refuses to import rolls back every move, the
      global CLI included, and leaves the old version on disk
      (proof: assertion:update.a_refused_release_rolls_back_whole)
- [x] `--check` names the release, and an operator's pin that holds the CLI
      below it
      (proof: assertion:update.a_check_names_the_release)
- [x] A checkout is never installed over and never asks npm; the global root
      is asked at most once, and both platforms' layouts are recognised
      (proof: test:packages/cli/tests/update.test.ts)
- [x] Auto-update, running before a workflow, moves the same release the
      command does
      (proof: assertion:update.auto_update_reaches_the_release)
- [x] The team list an older install kept at the machine root is copied into
      the profile that reads it, the old name retired beside it rather than
      deleted, the move named in what the update prints, and a second update
      changes nothing — from
      [the roster belongs to its workflow](../../plans/the-roster-belongs-to-its-workflow.md)
      (proof: assertion:update.the_roster_moves_into_its_profile)
      (proof: assertion:update.the_update_names_the_roster_move)

**Exit condition:** a machine two versions behind runs one command, ends
up on the current one with its work untouched, and the skills in its
harnesses describe the CLI that is now installed.
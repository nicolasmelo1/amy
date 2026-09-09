# Nothing is installed by default

Installing `@amykit/cli` installed a workflow, four plugins and a notifier,
and then `amy init` offered to install about fifteen more — because the host
carried the ticket workflow's vocabulary and one notifier's reader in its own
dependencies, `SHIPPED_PROFILES` gave three profiles to any config that
declared none, and `EXAMPLE_CONFIG` wrote two of them into the file.

Every one of those was a real workflow that somebody real might want. None of
them was the one the person installing amy was about to write, and a machine
that arrives pre-loaded with three processes teaches that amy is a thing with
processes in it rather than a thing you put yours into.

## What the machine does now

The command arrives alone: `@amykit/cli` depends on the host services and the
two readers it cannot do without, and on no workflow and no notifier. The
roster the ticket workflow reads is contributed by the host under the name
the workflow looks up — the name spelled where the file is read, not imported
from the workflow — and whether a Hermes target is reachable is asked of the
`notify` port the mounted channel contributes, which is knowledge that
travels with the plugin that owns it.

`SHIPPED_PROFILES` is empty. A config with no `workflows:` block drives
nothing, and every command that needs one says so in the same words and names
what writes one: `amy workflow new`, or `amy add` for a package that already
exists. The template `amy init` writes keeps the two published workflows as
commented examples, which is what they were always doing for the reader, and
its plugin slices are commented for the same reason — nothing is mounted yet,
so nothing can declare what its settings look like.

`amy init` writes the config, the roster and the notes directory, and
installs nothing; `--install` keeps working for a config that already names
things, which is the machine being rebuilt rather than the machine being set
up. On a machine with nothing mounted, `amy doctor` still reports everything
it can see and names the missing workflow in the selection's own words,
rather than ending before anything was said.

## The proof

The gate's scenario installs the command alone onto a machine that has
nothing else and asserts what it can and cannot do:

- `bare.the_command_arrives_alone` — no workflow is configured on the fresh
  install
- `bare.nothing_drives_before_somebody_names_one` — `amy workflow list`
  prints nothing
- `bare.it_says_what_to_do_instead_of_failing` — a command that needs a
  workflow names `amy workflow new`
- `bare.it_names_the_other_way_to_add_one` — the same refusal names `amy add`
- `bare.a_note_without_a_workflow_is_refused_with_the_fix` — `amy note` says
  what to mark in the config rather than failing
- `bare.init_installs_nothing` — `amy init` on the bare machine says it kept
  the plugins it did not need
- `bare.init_writes_its_files` — the config and the roster are written
- `bare.init_added_no_package` — the install's library is unchanged
- `bare.init_writes_no_declared_workflow` — the written config parses with
  no workflow declared
- `bare.doctor_asks_the_port_not_the_package` — the configured Hermes target
  is checked through the mounted channel or reported as unaskable
- `bare.doctor_still_reports_what_it_found` — everything that does not
  depend on a workflow is still reported
- `bare.no_workflow_mounts_so_nothing_assembles` — the missing workflow is
  the one refusal, in the selection's own words

The unit tests carry the halves a scenario cannot: the profile table is empty
before anybody writes a config, the written template parses and names every
setting there is, and a workflow whose roster nobody contributed refuses at
the tick with the command that writes the file, not with a collection's
internals.
# A plugin brings its own commands

The command line is the host's alone, so it grows commands on every workflow's behalf: every install carries ticket-to-qa's roster. And of 27 commands, the daily operator uses one and cannot tell its neighbours apart.


## The contract

A plugin — a workflow or an adapter — may declare three things beside
`register`:

- `commands`: name, description, arguments, flags, subcommands (one may be
  `default: true`), and a `run` that receives the profile's state directory,
  the machine's state root, its own schema-typed settings slice, the typed
  arguments and an output. A command may declare `mount: true`, and then it
  also receives the mounted ports, or a refusal naming why the machine did not
  come up. It is read after the module is imported and before anything mounts,
  which is what lets it answer on the machine that will not boot.
- `checks`: run by `amy doctor` after the host's own, labelled with the
  package that brought them, so a red one fails the doctor the same way.
- `files`: path and content, written by `amy init` and `amy add` into the
  profile's state directory, and never over a file that is already there.

The host owns the entry point, the parser and the ownership rules: a command
name belongs to one owner, `amy --help` marks it with the package, and the
seventeen built-ins are not on offer. What a command means is the plugin's.

`amy tick` looks before it moves, but only when the queue is empty: while it
holds work, the queue is the schedule, and discovering over it would trample
the backoff a waiting record is keeping. `discover` stays as a hidden verb for
a script that wants to queue without moving.

Two rules came out of making discovery that cheap. A note the machine wrote
about its own failure is filed and read by a person, and is not itself planned:
a plan that failed would file another note, which would be planned, which could
fail again. And discovery does not bring back work the engine has let go of —
a non-terminal record whose last queue item is done and which is on the queue
no more reached its attempt ceiling; re-adding it would fail again on every
look. `amy look <id>` is the named way back.

`amy btw` (errand), `amy note` (note-to-plan), `amy roster`
(ticket-to-qa), `amy worktrees` (file-worktree) and `amy models`
(agent-relay) moved with this. `pause`/`resume` became `amy stop --all` and
`amy start`; `discover` became the first act of `tick` and is kept hidden for
scripts that want to queue without moving; `poke` is `look`;
`workflow rm` merged into `remove <profile>` with `--keep-state`; the two
`plugin add`/`plugin remove` verbs are gone, and `daemon`/`after-daemon` are
hidden and still callable.

## What the gate says now

Three assertions were added to `ticket-to-qa` and three to `errand`, and both
gates carry them in `required_assertions`:

- `lifecycle.a_workflow_command_is_its_own` — `amy roster` is listed in
  `amy --help` beside `@amykit/workflow-ticket-to-qa`, and confirming it
  succeeds on the installed executable.
- `lifecycle.stop_all_holds_until_start` — `amy stop --all` ends what is
  running and holds the next `amy run`; `amy start` releases it.
- `errand.a_command_nothing_mounts_does_not_exist` — on a machine mounting the
  errand, `amy roster` is an unknown command.
- `errand.help_lists_only_the_machines_commands` — the commands this machine
  mounted are listed (`btw`, `worktrees`, `models`), and pause, resume,
  discover, poke, note and roster are not: a command appears exactly when its
  package does.
- `errand.a_tick_discovers_before_it_moves` — the hand-written task files were
  never queued, and the tick that found them is the tick that moved one.

The unit-level half lives in `packages/cli/tests/plugin-commands.test.ts`
(commands, ownership refusals, the refusal of a `mount: true` command, checks
in the doctor, files written once), `packages/cli/tests/remove.test.ts` (a
profile removed with and without its state) and
`packages/cli/tests/models.test.ts` (a stale table refreshed, a fresh one kept,
a failed refresh leaving it as it was).

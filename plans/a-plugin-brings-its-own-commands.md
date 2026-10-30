# A plugin brings its own commands

The command line is the host's, and only the host's. Every command is written
into `packages/cli/src/index.ts`. So when a workflow needs a command of its
own, the host grows one on the workflow's behalf. `amy roster confirm` and
`amy roster show` (`packages/cli/src/index.ts:2543`) are ticket-to-qa
commands that every install carries, whichever workflow it drives. The same
goes for the checks and the files around them: `amy doctor` checks a roster
(`packages/cli/src/doctor.ts:195`) and `amy init` writes one
(`packages/cli/src/index.ts:266`), even on a machine that will never assign a
reviewer.

Frameworks already solved this. Django registers a `manage.py` command for
every module in an installed app's `management/commands` directory. Rails
lets an engine load its own Rake tasks and generators through its railtie.
In both, the framework owns the entry point and what is installed fills it.
amy is a framework for workflows the way Rails is one for web applications
([a workflow is three pieces](../docs/design/a-workflow-is-three-pieces.md)), and its
entry point should work the same way.

The roster is not the only command in the wrong place, and once commands can
move it is worth asking of each one whether the machine needs it. `amy --help`
lists 27. The person who runs amy every day uses `start` and nothing else of
the lifecycle, has never run `btw` or `remove`, and could not say what tells
`pause` from `stop`, `resume` from `start`, or what `poke`, `daemon` and
`after-daemon` are for. A command nobody can tell apart from its neighbour is a
command that costs a reading of the docs every time it is needed.

## What changes

**A plugin can declare `commands`, `checks` and `files`.** All three are plain
data on the plugin, read after `load()` and without a mount. The commands that
matter most are the ones somebody runs while the machine is broken, so they
must not depend on the machine coming up.

```ts
export const plugin: Plugin = {
  name: "@amykit/workflow-ticket-to-qa",
  commands: {
    roster: {
      description: "Who is reviewing today",
      subcommands: {
        confirm: { description: "Stamp the roster with today's date", run: confirm },
        show: { description: "Print the roster and whether it is current", run: show, default: true },
      },
    },
  },
  checks: [rosterIsConfirmed],
  files: { "roster.yaml": EXAMPLE_ROSTER },
  register(registry) { /* unchanged */ },
};
```

`defineWorkflow` accepts the same three members, so a workflow written as
three pieces declares its commands in the same call.

- **`commands`** become `amy <name>`, listed in `amy --help` beside the
  built-in ones and marked with the package that brought them. A command's
  `run` receives the profile's state directory, the plugin's settings slice as
  its schema typed it, the arguments, and an output to write to. It does not
  receive ports. A command that needs the whole machine says
  `mount: true`, and gets the mounted ports, or a refusal naming why the
  machine did not come up.
- **`checks`** run inside `amy doctor`, after the host's own checks, under
  the plugin's name. Each one returns the same `Check` the host's checks
  return, so a red one fails `doctor` the same way.
- **`files`** are written by `amy init` and `amy add` into the profile's state
  directory, next to the records and the queue that
  `directoriesFor` (`packages/cli/src/profiles.ts:184`) already gives it. A
  file that already exists is never overwritten.

**Which commands exist depends on the config.** The commands are those of
every plugin the configured profiles mount. A machine that drives only the
errand has no `amy roster`. A command run against a profile whose plugins do
not contribute it is refused, naming the profiles that do. When two profiles
mount the same package, `--workflow` picks one, as it does for every other
command.

**A name is owned once.** A plugin command that reuses a built-in name, or a
name another package already contributes, is refused when the CLI loads, and
the refusal names both owners. Django lets the later app silently replace the
earlier one. That is the behaviour this rule exists to prevent: a command that
changes depending on the order of the config is a command nobody can trust.
The built-in commands stay built in, and a plugin cannot replace `doctor`,
`tick` or `update`.

**Any plugin, not only workflows.** A workflow is a plugin, so it gets the
mechanism for free. Restricting it to workflows would only stop the Linear
plugin from shipping `amy linear whoami`, and that is the kind of command
`doctor` would otherwise grow on its behalf.

## The command line keeps only what is the machine's

The rule for a built-in command: it makes sense on every install, including one
that drives only the errand. What fails it moves, merges, hides or goes.

**Five commands leave with their owner.** Each one either names one workflow's
vocabulary or builds one adapter by hand, bypassing the port it should go
through, so a different adapter mounted in its place is never seen:

| Command | Why it is not the machine's | It moves to |
| :-- | :-- | :-- |
| `amy roster` | Only ticket-to-qa assigns reviewers | `@amykit/workflow-ticket-to-qa` ([the roster belongs to its workflow](the-roster-belongs-to-its-workflow.md)) |
| `amy btw` | Builds `FileTasks` and `FileQueue` by hand (`packages/cli/src/index.ts:850`) | `@amykit/workflow-errand`, with the `amy-btw` skill beside it |
| `amy note` | Builds `FileNotes` by hand (`packages/cli/src/index.ts:785`) and reads `plans.repos`, note-to-plan's setting | `@amykit/workflow-note-to-plan` |
| `amy worktrees` | Builds a `WorktreeManager` from `@amykit/plugin-file-worktree` by hand (`packages/cli/src/index.ts:2584`) | `@amykit/plugin-file-worktree` |
| `amy models` | Model prices are the business of whatever calls an agent | `@amykit/plugin-agent-relay`, reading `@amykit/model-specs` |

The CLI then imports no `plugin-file-notes`, `plugin-file-tasks` or
`plugin-file-worktree`, and a rule keeps it that way.

**One pair turns the machine on and off.** Today there are two:

- `start` and `stop` run and end one workflow's loop
  (`packages/cli/src/index.ts:493`, `:573`).
- `pause` and `resume` pull and release a handbrake for the whole machine: work
  in flight is ended, nothing new starts, the loop stays up, and the handbrake
  is a file that survives a reboot (`packages/cli/src/index.ts:451`, `:467`).

`pause` and `resume` go. `amy stop` ends the selected workflow's loop and the
run it has in flight, as its `SIGTERM` already does. `amy stop --all` is the
handbrake: it ends every loop and every run in flight, including an `amy run`
in another terminal, and nothing starts until `amy start`, which releases it.
The one case `pause` served, holding everything while somebody deploys, is
`stop --all`.

**`discover` goes, because `start` already does it.** The loop discovers on
every pass (`packages/cli/src/index.ts:643`). The command only existed so the
quickstart could put work on the queue before one `tick`, so `tick` discovers
first and the quickstart loses the step.

**`daemon` and `after-daemon` are hidden.** `daemon` is the loop in the
foreground that `start` runs, and `after-daemon` is what `start` spawns to
update once a loop has exited (`packages/cli/src/index.ts:559`). Neither is
something a person types. Both stay callable and leave `amy --help`.

**`remove` and `workflow rm` are one command.** `amy remove` uninstalls a
package (`packages/cli/src/index.ts:1648`), and `amy workflow rm` deletes a
workflow's records, its queue and its config entry
(`packages/cli/src/index.ts:2456`). Nobody can guess which one undoes
`amy add`. `amy remove <workflow>` does both, asking before it deletes state
and accepting `--keep-state`, and `workflow rm` goes. The same holds for
plugins: `amy plugin add` and `amy plugin remove`, which only edit the list a
profile mounts and leave installing to somebody else, go. `amy add` and
`amy remove` are the verbs, and `amy plugin` only lists.

**`poke` is `look`.** It brings one piece of work forward instead of waiting
out its backoff (`packages/cli/src/index.ts:726`), which is what somebody
wants right after answering in a thread. `amy look <id>` says so. Once *an
event is a reason to look* lands, the webhook does it and the command is for
the rare case.

**Model prices refresh themselves.** Today they change only when somebody
runs `amy models refresh`: nothing else calls `refreshFrom`. `amy update` and
`amy start` refresh a table older than seven days, keeping what models.dev
does not carry, and a refresh that fails leaves the table as it was and says
so once. `amy models` shows the table.

Afterwards the built-in list is `init`, `doctor`, `add`, `remove`, `update`,
`start`, `stop`, `status`, `tick`, `run`, `look`, `queue`, `budget`, `brief`,
`skills`, `workflow` and `plugin`, and every one of them means the same on
every install.

## What does not change

The built-in commands remain in `index.ts`. They are about the machine
(queue, engine, install), not about any one process. Plugins still mount
through `register`. `commands`, `checks` and `files` are read beside it, never
through it. The core does not import `commander`: the core types say what a
command is, and the CLI decides how a command is parsed.

## Acceptance criteria

- [ ] A plugin outside this repository that declares a command, installed with
      `amy add`, appears in `amy --help` marked with its package and runs, and
      disappears when it is removed
      (proof: deferred:test:packages/cli/tests/plugin-commands.test.ts)
- [ ] A plugin command runs while the configured machine fails to mount, and a
      `mount: true` command on the same machine is refused with the mount's
      reason
      (proof: deferred:test:packages/cli/tests/plugin-commands.test.ts)
- [ ] A plugin command named like a built-in, or like another package's
      command, is refused at load, naming both owners
      (proof: deferred:test:packages/cli/tests/plugin-commands.test.ts)
- [ ] A plugin's check turns `amy doctor` red under the plugin's name, and a
      plugin's file is written by `amy init` once and never overwritten
      (proof: deferred:test:packages/cli/tests/plugin-commands.test.ts)
- [ ] In the `ticket-to-qa` scenario, through the installed executable,
      `amy --help` lists `amy roster` as the workflow's command and it runs
      (proof: deferred:assertion:lifecycle.a_workflow_command_is_its_own)
- [ ] In the errand's scenario, on a machine that mounts nothing contributing
      it, `amy roster` does not exist
      (proof: deferred:assertion:errand.a_command_nothing_mounts_does_not_exist)

- [ ] `amy --help` lists no `pause`, `resume`, `discover`, `daemon`,
      `after-daemon`, `poke`, `btw`, `note`, `worktrees`, `roster` or `models`
      on a machine that mounts only the errand, and the hidden two still run
      (proof: deferred:assertion:errand.help_lists_only_the_machines_commands)
- [ ] `amy btw`, `amy note`, `amy worktrees` and `amy models` appear on a
      machine that mounts their owner, and the CLI imports none of
      `plugin-file-notes`, `plugin-file-tasks` or `plugin-file-worktree`
      (proof: deferred:test:packages/cli/tests/plugin-commands.test.ts)
- [ ] `amy stop --all` ends every loop and an `amy run` in flight, nothing
      starts until `amy start`, and `amy start` releases it
      (proof: deferred:assertion:lifecycle.stop_all_holds_until_start)
- [ ] `amy tick` on an empty queue discovers first and makes the move
      (proof: deferred:assertion:errand.a_tick_discovers_before_it_moves)
- [ ] `amy remove <workflow>` uninstalls it and, when told to, deletes its
      records and queue, and keeps them with `--keep-state`
      (proof: deferred:test:packages/cli/tests/remove.test.ts)
- [ ] A price table older than seven days is refreshed by `amy update`, and a
      refresh that fails leaves it as it was
      (proof: deferred:test:packages/cli/tests/models.test.ts)

**Exit condition:** in the `ticket-to-qa` scenario, through the installed
executable, `amy --help` lists a command the workflow brought, `amy doctor`
runs the check it brought, and `amy init` writes the file it brought. In the
errand's scenario none of the three exists, `amy --help` lists only the
machine's commands, and `amy tick` discovers before it moves. One `start` and
one `stop` turn the machine on and off, and the `ticket-to-qa` and errand
gates require every assertion above.

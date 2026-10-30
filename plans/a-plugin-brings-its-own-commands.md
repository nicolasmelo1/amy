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
([a workflow is three pieces](a-workflow-is-three-pieces.md)), and its
entry point should work the same way.

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

**Exit condition:** in the `ticket-to-qa` scenario, through the installed
executable, `amy --help` lists a command the workflow brought, `amy doctor`
runs the check it brought, and `amy init` writes the file it brought. In the
errand's scenario none of the three exists, and the `ticket-to-qa` and errand
gates require both assertions.

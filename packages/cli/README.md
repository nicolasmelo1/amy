# @amykit/cli

The `amy` command: one install per machine, reached from any harness.

It reads the configuration, installs and loads the plugins it names, mounts
them, and drives the loop. It holds no domain logic and builds no adapter:
every decision belongs to a workflow and every effect to a plugin. The package
exports nothing for code to import; what it ships is the `amy` binary and
amy's skills in [`skills/`](skills/).

## Start here

```sh
npm install -g @amykit/cli
amy setup                # the harness, the workflow, the channels, one question at a time
amy doctor               # check every dependency before it touches a ticket
amy tick                 # one move, discovering first, so you can watch it
amy start                # the loop, kept running by the machine's supervisor
```

`amy doctor` exits non-zero, so it is safe to gate on. It checks the config,
each plugin's settings against the schema that plugin declared, the tools the
mounted plugins shell out to, and every check a mounted plugin adds. `amy
start` discovers on every pass, so `tick` is only how you watch one move before
trusting the loop.

## Adding and removing

```sh
amy add @amykit/workflow-errand    # a workflow or a plugin, by name or a path
amy remove @amykit/plugin-slack
amy plugin list                    # what is mounted, and what it assembled into
amy update                         # move the install forward
```

Plugins are installed into `~/.amy/plugins`, never compiled into the command.
`amy add` installs, mounts and checks the machine still boots; `amy remove`
refuses what the machine would not survive. Why: [plugins live in amy's
home](../../docs/design/plugins-live-in-amy-home.md), [amy add and amy
remove](../../docs/design/amy-add-and-amy-remove.md), [amy
update](../../docs/design/amy-update.md).

Everything is refused at mount, by name: a plugin that will not import, a
setting it did not declare, a port claimed by more than one plugin, and an action
a workflow emits that nothing can run:

```text
action `implement`: needs the `agent` port, which nothing mounted
```

## Commands a plugin brings

A mounted plugin may add its own commands, doctor checks and files:
`ticket-to-qa` brings `amy roster`, the errand brings `amy btw`. They are typed
on a machine that mounted the plugin and unknown on one that did not. Why: [a
plugin brings its own commands](../../docs/design/a-plugin-brings-its-own-commands.md).

## Stopping

`amy stop` ends the background loop. `amy stop --all` pulls the machine's
handbrake: it ends every loop and run in flight, and nothing starts until `amy
start`.

Every command, with its arguments and defaults, is in the [CLI
reference](../../docs/reference/cli.md).

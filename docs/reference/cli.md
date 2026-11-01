---
title: CLI
description: Every command, argument, option and default — read out of the command itself.
group: Reference
order: 1
---

# CLI reference

Everything on this page is read out of the CLI's own declaration on every build.
If it is here, the command has it.

```sh
amy [--workflow <name>] <command> [options]
```

## Global options

<!-- amy:generated cli-global -->

| Option | What it does |
| :-- | :-- |
| `--workflow <name>` | which workflow to drive, by the name the config gives it |

<!-- amy:end cli-global -->

`--workflow` goes **before** the command and chooses which profile it drives.
With nothing named, `defaultWorkflow` wins, and then the first profile declared.
See [Workflows and profiles](../start/workflows-and-profiles.md).

## Every command

<!-- amy:generated cli-index -->

| Command | What it does |
| :-- | :-- |
| [`amy add`](#amy-add) | Add a workflow or a plugin: install it, mount it, and check the machine boots |
| [`amy brief`](#amy-brief) | The current statement of a feature, as the workflow keeps it |
| [`amy budget`](#amy-budget) | What the agents have spent, and how close that is to the ceiling |
| [`amy doctor`](#amy-doctor) | Check everything the machine depends on before it touches a ticket |
| [`amy init`](#amy-init) | Write the config and the files the mounted plugins bring, and install what they need |
| [`amy look`](#amy-look) | Look at one piece of work now, rather than when it was next due |
| [`amy plugin`](#amy-plugin) | What is mounted, and what is not |
| [`amy plugin list`](#amy-plugin-list) | The plugins this install mounts, and what they assembled into |
| [`amy queue`](#amy-queue) | Inspect and tidy the queue |
| [`amy queue prune`](#amy-queue-prune) | Delete finished queue items past their retention |
| [`amy queue recover`](#amy-queue-recover) | Return items abandoned by a dead worker |
| [`amy remove`](#amy-remove) | Remove a workflow profile or a plugin, refusing what the machine would not survive |
| [`amy run`](#amy-run) | Keep advancing until nothing is due |
| [`amy skills`](#amy-skills) | Install amy's skills into the harnesses on this machine |
| [`amy start`](#amy-start) | Start the loop in the background, and keep it running |
| [`amy status`](#amy-status) | Show where every piece of work stands and what the queue holds |
| [`amy stop`](#amy-stop) | Stop the background loop; --all pulls the machine's handbrake |
| [`amy tick`](#amy-tick) | Advance one piece of work by one move, discovering first |
| [`amy update`](#amy-update) | Move this install forward: both roots, refusing to leave the machine half-updated |
| [`amy workflow`](#amy-workflow) | What this install can drive, and what it keeps |
| [`amy workflow add`](#amy-workflow-add) | Copy a workflow into one of your own, to call it there as code you own |
| [`amy workflow check`](#amy-workflow-check) | Drive a workflow's lifecycle against its stub world |
| [`amy workflow export`](#amy-workflow-export) | Print a workflow's diagram, which renders wherever Mermaid does |
| [`amy workflow list`](#amy-workflow-list) | Every workflow this install can drive |
| [`amy workflow new`](#amy-workflow-new) | Write an editable workflow under ~/.amy/workflows |

<!-- amy:end cli-index -->

## Commands in detail

<!-- amy:generated cli-commands -->

### `amy add`

Add a workflow or a plugin: install it, mount it, and check the machine boots

```sh
amy add <spec>
```

| Argument | Required | What it is |
| :-- | :-- | :-- |
| `<spec>` | yes | a package name, a URL, a git URL, or a path |

### `amy brief`

The current statement of a feature, as the workflow keeps it

```sh
amy brief [options] <id>
```

| Argument | Required | What it is |
| :-- | :-- | :-- |
| `<id>` | yes | the brief id, as the workflow named it |

| Option | Default | What it does |
| :-- | :-- | :-- |
| `--json` |  | the same snapshot as data, for something else to render |

### `amy budget`

What the agents have spent, and how close that is to the ceiling

```sh
amy budget
```

### `amy doctor`

Check everything the machine depends on before it touches a ticket

```sh
amy doctor
```

### `amy init`

Write the config and the files the mounted plugins bring, and install what they need

```sh
amy init [options]
```

| Option | Default | What it does |
| :-- | :-- | :-- |
| `--install` |  | install the missing packages without asking |
| `--no-install` |  | only print what is missing |

### `amy look`

Look at one piece of work now, rather than when it was next due

```sh
amy look <workId>
```

| Argument | Required | What it is |
| :-- | :-- | :-- |
| `<workId>` | yes | the work to bring forward, such as a ticket key |

### `amy plugin`

What is mounted, and what is not

```sh
amy plugin
```

### `amy plugin list`

The plugins this install mounts, and what they assembled into

```sh
amy plugin list
```

### `amy queue`

Inspect and tidy the queue

```sh
amy queue
```

### `amy queue prune`

Delete finished queue items past their retention

```sh
amy queue prune [options]
```

| Option | Default | What it does |
| :-- | :-- | :-- |
| `--days <n>` |  | override the configured retention |

### `amy queue recover`

Return items abandoned by a dead worker

```sh
amy queue recover
```

### `amy remove`

Remove a workflow profile or a plugin, refusing what the machine would not survive

```sh
amy remove [options] <spec>
```

| Argument | Required | What it is |
| :-- | :-- | :-- |
| `<spec>` | yes | the profile, or the package name the config carries |

| Option | Default | What it does |
| :-- | :-- | :-- |
| `--keep-state` |  | keep the profile's records and queue |
| `--yes` |  | delete the profile's state without asking |

### `amy run`

Keep advancing until nothing is due

```sh
amy run [options]
```

| Option | Default | What it does |
| :-- | :-- | :-- |
| `--max <n>` | `100` | stop after this many moves |

### `amy skills`

Install amy's skills into the harnesses on this machine

```sh
amy skills [options]
```

| Option | Default | What it does |
| :-- | :-- | :-- |
| `--all` |  | every harness found, without asking |
| `--harness <name>` |  | one harness by name, without asking |
| `--dir <path>` |  | a directory, for a harness this does not know |
| `--recorded` |  | rewrite into the harnesses `amy skills` wrote to before, and nothing else |

### `amy start`

Start the loop in the background, and keep it running

```sh
amy start [options]
```

| Option | Default | What it does |
| :-- | :-- | :-- |
| `--every <seconds>` | `60` | how long to wait after finding nothing to do |

### `amy status`

Show where every piece of work stands and what the queue holds

```sh
amy status [options]
```

| Option | Default | What it does |
| :-- | :-- | :-- |
| `--json` |  | the same thing as data, for something else to render |
| `--all` |  | include work that has finished |

### `amy stop`

Stop the background loop; --all pulls the machine's handbrake

```sh
amy stop [options]
```

| Option | Default | What it does |
| :-- | :-- | :-- |
| `--all` |  | end every loop and run in flight, and start nothing until `amy start` |

### `amy tick`

Advance one piece of work by one move, discovering first

```sh
amy tick
```

### `amy update`

Move this install forward: both roots, refusing to leave the machine half-updated

```sh
amy update [options] [package]
```

| Argument | Required | What it is |
| :-- | :-- | :-- |
| `[package]` | no | one package to update, by the name the root's manifest carries |

| Option | Default | What it does |
| :-- | :-- | :-- |
| `--check` |  | name every package that would move, and to what, without moving anything |

### `amy workflow`

What this install can drive, and what it keeps

```sh
amy workflow
```

### `amy workflow add`

Copy a workflow into one of your own, to call it there as code you own

```sh
amy workflow add <spec>
```

| Argument | Required | What it is |
| :-- | :-- | :-- |
| `<spec>` | yes | a package amy installed, or a path to a workflow's directory or entry |

### `amy workflow check`

Drive a workflow's lifecycle against its stub world

```sh
amy workflow check <name>
```

| Argument | Required | What it is |
| :-- | :-- | :-- |
| `<name>` | yes | the configured workflow to check |

### `amy workflow export`

Print a workflow's diagram, which renders wherever Mermaid does

```sh
amy workflow export [options] <name>
```

| Argument | Required | What it is |
| :-- | :-- | :-- |
| `<name>` | yes | the configured workflow to export |

| Option | Default | What it does |
| :-- | :-- | :-- |
| `--work <id>` |  | mark the state this piece of work is in |
| `--expand` |  | draw each call as the workflow it calls, for reading; with --work, mark the work at every depth |

### `amy workflow list`

Every workflow this install can drive

```sh
amy workflow list
```

Runs when `amy workflow` is given no subcommand.

### `amy workflow new`

Write an editable workflow under ~/.amy/workflows

```sh
amy workflow new [options] <name>
```

| Argument | Required | What it is |
| :-- | :-- | :-- |
| `<name>` | yes | one directory name, such as oncall |

| Option | Default | What it does |
| :-- | :-- | :-- |
| `--from <file>` |  | a Mermaid stateDiagram-v2 to copy in as the workflow's shape, every decision a stub |

<!-- amy:end cli-commands -->

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
| [`amy btw`](#amy-btw) | Something to do, said in passing. Goes on the queue, never becomes a ticket |
| [`amy budget`](#amy-budget) | What the agents have spent, and how close that is to the ceiling |
| [`amy daemon`](#amy-daemon) | The loop itself, in the foreground. `amy start` runs this for you |
| [`amy discover`](#amy-discover) | Put every piece of work the workflow can find onto the queue |
| [`amy doctor`](#amy-doctor) | Check everything the machine depends on before it touches a ticket |
| [`amy init`](#amy-init) | Write the config and roster templates, and install what they need |
| [`amy models`](#amy-models) | What each model is believed to cost |
| [`amy models refresh`](#amy-models-refresh) | Take the base rates from models.dev, keeping what it does not carry |
| [`amy models show`](#amy-models-show) | The price table in force |
| [`amy note`](#amy-note) | Write a piece of friction down, and put it on the queue |
| [`amy pause`](#amy-pause) | Pull the handbrake: end work in flight and start nothing new |
| [`amy plugin`](#amy-plugin) | What is mounted, and what is not |
| [`amy plugin add`](#amy-plugin-add) | Mount a plugin, by package name or path |
| [`amy plugin list`](#amy-plugin-list) | The plugins this install mounts, and what they assembled into |
| [`amy plugin remove`](#amy-plugin-remove) | Stop mounting a plugin |
| [`amy queue`](#amy-queue) | Inspect and tidy the queue |
| [`amy queue prune`](#amy-queue-prune) | Delete finished queue items past their retention |
| [`amy queue recover`](#amy-queue-recover) | Return items abandoned by a dead worker |
| [`amy resume`](#amy-resume) | Release the handbrake |
| [`amy roster`](#amy-roster) | Who is reviewing today |
| [`amy roster confirm`](#amy-roster-confirm) | Stamp the roster with today's date |
| [`amy roster show`](#amy-roster-show) | Print the roster and whether it is current |
| [`amy run`](#amy-run) | Keep advancing until nothing is due |
| [`amy skills`](#amy-skills) | Install amy's skills into the harnesses on this machine |
| [`amy start`](#amy-start) | Start the loop in the background, and keep it running |
| [`amy status`](#amy-status) | Show where every piece of work stands and what the queue holds |
| [`amy stop`](#amy-stop) | Stop the background loop |
| [`amy tick`](#amy-tick) | Advance one piece of work by one move |
| [`amy workflow`](#amy-workflow) | What this install can drive, and what it keeps |
| [`amy workflow list`](#amy-workflow-list) | Every workflow this install can drive |
| [`amy workflow rm`](#amy-workflow-rm) | Delete a workflow's records, its queue and its entry in the config |

<!-- amy:end cli-index -->

## Commands in detail

<!-- amy:generated cli-commands -->

### `amy btw`

Something to do, said in passing. Goes on the queue, never becomes a ticket

```sh
amy btw [options] <text>
```

| Argument | Required | What it is |
| :-- | :-- | :-- |
| `<text>` | yes | what to do, in your own words |

| Option | Default | What it does |
| :-- | :-- | :-- |
| `--repo <owner/name>` |  | the repository it is in |
| `--source <who>` | `somebody at a keyboard` | who asked |

### `amy budget`

What the agents have spent, and how close that is to the ceiling

```sh
amy budget
```

### `amy daemon`

The loop itself, in the foreground. `amy start` runs this for you

```sh
amy daemon [options]
```

| Option | Default | What it does |
| :-- | :-- | :-- |
| `--every <seconds>` | `60` | how long to wait after finding nothing to do |

### `amy discover`

Put every piece of work the workflow can find onto the queue

```sh
amy discover
```

### `amy doctor`

Check everything the machine depends on before it touches a ticket

```sh
amy doctor
```

### `amy init`

Write the config and roster templates, and install what they need

```sh
amy init [options]
```

| Option | Default | What it does |
| :-- | :-- | :-- |
| `--install` |  | install the missing packages without asking |
| `--no-install` |  | only print what is missing |

### `amy models`

What each model is believed to cost

```sh
amy models
```

### `amy models refresh`

Take the base rates from models.dev, keeping what it does not carry

```sh
amy models refresh [options]
```

| Option | Default | What it does |
| :-- | :-- | :-- |
| `--dry-run` |  | say what would change and write nothing |

### `amy models show`

The price table in force

```sh
amy models show
```

### `amy note`

Write a piece of friction down, and put it on the queue

```sh
amy note [options] <text>
```

| Argument | Required | What it is |
| :-- | :-- | :-- |
| `<text>` | yes | what went wrong, in your own words |

| Option | Default | What it does |
| :-- | :-- | :-- |
| `--repo <owner/name>` |  | the repository it is about |
| `--source <who>` | `somebody at a keyboard` | who noticed |

### `amy pause`

Pull the handbrake: end work in flight and start nothing new

```sh
amy pause [reason]
```

| Argument | Required | What it is |
| :-- | :-- | :-- |
| `[reason]` | no | why, so the log says something useful later |

### `amy plugin`

What is mounted, and what is not

```sh
amy plugin
```

### `amy plugin add`

Mount a plugin, by package name or path

```sh
amy plugin add <spec>
```

| Argument | Required | What it is |
| :-- | :-- | :-- |
| `<spec>` | yes | anything Node can import: a package name, or a path |

### `amy plugin list`

The plugins this install mounts, and what they assembled into

```sh
amy plugin list
```

### `amy plugin remove`

Stop mounting a plugin

```sh
amy plugin remove <spec>
```

| Argument | Required | What it is |
| :-- | :-- | :-- |
| `<spec>` | yes | the package name or path to drop |

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

### `amy resume`

Release the handbrake

```sh
amy resume
```

### `amy roster`

Who is reviewing today

```sh
amy roster
```

### `amy roster confirm`

Stamp the roster with today's date

```sh
amy roster confirm
```

### `amy roster show`

Print the roster and whether it is current

```sh
amy roster show
```

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

### `amy stop`

Stop the background loop

```sh
amy stop
```

### `amy tick`

Advance one piece of work by one move

```sh
amy tick
```

### `amy workflow`

What this install can drive, and what it keeps

```sh
amy workflow
```

### `amy workflow list`

Every workflow this install can drive

```sh
amy workflow list
```

Runs when `amy workflow` is given no subcommand.

### `amy workflow rm`

Delete a workflow's records, its queue and its entry in the config

```sh
amy workflow rm [options] <name>
```

| Argument | Required | What it is |
| :-- | :-- | :-- |
| `<name>` | yes | the profile to forget |

| Option | Default | What it does |
| :-- | :-- | :-- |
| `--yes` |  | actually delete, rather than saying what would go |

<!-- amy:end cli-commands -->

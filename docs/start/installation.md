---
title: Installation
description: One install per machine, where its state lives, and how to carry only the plugins you use.
group: Start here
order: 3
---

# Installation

## Requirements

| | |
| :-- | :-- |
| **Node** | 24 or newer |
| **git** | any recent version, on the `PATH` |
| **A code host CLI** | `gh`, for the shipped GitHub plugin |
| **A coding agent** | `claude`, `codex` or Hermes — at least one, for the shipped harnesses |

Only the first two are required by amy itself. The rest are required by the
*plugins you mount*, which is why `amy doctor` checks them rather than the
installer: a machine with no `codex` on it should not be carrying the plugin
that shells out to one.

## Installing

```sh
npm install -g @amykit/cli
amy --version
```

That is the command itself. **It carries nothing else**, deliberately: a plugin
is resolved by name at run time, and a machine with no `codex` on it has no
reason to hold the plugin that shells out to one.

What your config needs is installed by the step after it:

```sh
amy init
```

`init` writes the templates, works out which packages the workflows in your
config need, and offers to install the ones this machine has not got:

```text
These are not installed yet:
  @amykit/plugin-linear
  @amykit/plugin-github
  @amykit/plugin-claude
  @amykit/plugin-agent-relay

Install them now? [Y/n]
```

It asks rather than assuming, because installing into a global prefix is a
change to the machine and not to amy. With nothing to ask on — a script, a
pipe, CI — it prints the command instead of running it, and `--install` is how
a pipeline says yes:

```sh
amy init --install        # install without asking
amy init --no-install     # only print what is missing
```

Adding a workflow later is the same two steps: name it in the config, run
`amy init` again.

### Why global

Node resolves a package by walking up from the importing module, so a package
installed beside the command is one the command can import. That is what lets
an install carry a plugin this repository has never heard of:

```sh
npm install -g @acme/plugin-jira
```

If npm exits zero and a package still does not resolve, `amy init` says so
rather than leaving you with a mount that refuses by name later. The usual
cause is a global prefix that is not the one amy is installed under —
`npm prefix -g` is the thing to compare.

### A plugin a config names and nothing installed

Refused at boot, by name, with the list of what there was:

```
amy could not start:
  @amykit/plugin-codex: not installed — install it, or drop it from the config

Installed: @amykit/plugin-claude, @amykit/plugin-file-queue, …
```

`amy init` is what stops you meeting that: it works the missing set out before
anything touches a ticket.

### Windows, macOS, Linux

There is no install script and nothing to clone. It is npm, so the three work
the same, and the `amy` command is put on the PATH by npm's own shim.

### Installing from a checkout

Only for working on amy itself, and for the gates that prove an install works
without a registry at all:

```sh
git clone https://github.com/nicolasmelo1/amy && cd amy
npm ci
npm run install:local     # packs every package, installs to ~/.local/bin/amy
```

`AMY_PACKAGES` takes a subset of what to install, which is what the
`installed-plugins` gate uses to build a machine carrying four packages and a
workflow written elsewhere. See [The gate](../development/the-gate.md).

## Where it keeps things

Everything amy knows lives in one directory:

```text
~/.amy/
├── config.yaml            what to drive, and what to mount
├── roster.yaml            who is reviewing, and when that was last confirmed
├── .env                   credentials. Never committed, never logged
├── events.jsonl           the append-only log. One log, therefore one budget
├── stop                   the handbrake, when it is pulled
└── <profile>/             one directory per workflow profile
    ├── records/           one file per piece of work
    └── queue/             one file per queued item
```

**One amy per machine, not one per repository.** It drives work in checkouts all
over the disk and it is reached from whichever harness you happen to be in, so
its memory cannot depend on where you were standing when you typed the command.
An `amy status` run from the wrong directory that answered "nothing tracked yet"
would be a lie with a plausible explanation.

`AMY_HOME` overrides the location. Nothing else does — not a flag, not a config
key, not the working directory. A second install, a test, or a scratch run uses
it:

```sh
AMY_HOME=/tmp/amy-scratch amy status
```

If amy finds an `.amy` directory in the directory you are standing in, it
*reports* it rather than adopting it. Picking it up silently would mean the same
command answering differently depending on where you typed it, which is the
behaviour this moved away from.

## Your working directory should not be a repository

amy works on tickets that name real colleagues and real customers. If the
program doing that work ran inside a git repository, every accident that drops a
file in the working directory would be one `git add -A` away from being
published. It keeps nothing where you are standing.

There is a gate that proves it: the installed command is run from a directory
with no checkout in it, and the directory is asserted to be untouched
afterwards. See [The gate](../development/the-gate.md).

## Credentials

Secrets go in `~/.amy/.env`, one per line:

```sh
LINEAR_API_KEY=lin_api_…
```

Anything already exported in the shell wins over the file, so exporting a key
for one command stays a reliable way to override it. A `.env` in the directory
you ran the command from is also read, and beats the machine-wide one — that is
what a project-local key is for.

Which variables matter depends on which plugins you mount:

<!-- amy:generated environment -->

| Variable | Read by |
| :-- | :-- |
| `LINEAR_API_KEY` | `@amykit/plugin-linear` |

<!-- amy:end environment -->

## Verifying the install

```sh
amy doctor
```

It checks the config, each plugin's settings against the schema that plugin
declared, the roster's freshness, the credentials, the external commands, the
notification target, and that every configured repository is actually checked
out. It exits non-zero, so it is safe to put in a shell profile or a cron
wrapper. See [Status and doctor](status-and-doctor.md).

## Every line names the build that wrote it

```
0.1.0 (83ef192, built 2026-09-03T20:28:44Z)
```

An install built from a tree with uncommitted work in it stamps `dev`, because
that is the truth: it is not a release anybody can go back to. The stamp goes on
every line of the event log, so "we improved this" and "what failed yesterday"
stay comparable across builds.

---
title: Installation
description: One install per machine, where its state lives, and how it carries only the plugins you use.
group: Start here
order: 3
---

# Installation

## Requirements

<!-- amy:generated readme-node-version -->

Node 22.18 or later runs the command.

<!-- amy:end readme-node-version -->

| | |
| :-- | :-- |
| **Node** | 22.18 or newer, as above |
| **git** | any recent version, on the `PATH`, for a workflow that works in repositories |
| **A code host CLI** | `gh`, for the shipped GitHub plugin |
| **A coding agent** | `claude`, `codex` or Hermes: at least one, for the shipped harnesses |

Node is what amy itself needs. The rest are needed by the plugins you mount,
which is why `amy doctor` checks them and the installer does not.

## Installing

```sh
npm install -g @amykit/cli
amy --version
```

That installs the command and nothing else. A plugin is resolved by name at run
time, and a machine with no `codex` on it has no reason to hold the plugin that
shells out to one. Why: [nothing is installed by default](../design/nothing-is-installed-by-default.md)
and [plugins are installed, not compiled in](../design/plugins-are-installed-not-compiled-in.md).

What the machine needs is chosen next:

```sh
amy setup
```

`setup` asks one question at a time: which harness does the work (the ones found
on this machine first), which workflow it drives, and which channels reach you.
It installs only what you chose, asks each chosen plugin's settings with the
machine's current value as the default, and checks what it configured before it
finishes. Setup is itself a workflow: [setup is a workflow](../design/setup-is-a-workflow.md).

With no terminal to answer (a script, a pipe, CI), it stops on the question and
prints the flag that answers it, so a pipeline gives every answer at once:

```sh
amy setup --harness codex --workflow errand --channels slack
```

A published workflow or plugin is added later with `amy add <spec>`; see
[Install a plugin](../guides/install-a-plugin.md). A workflow of your own starts
with `amy workflow new <name>`; see [Write a workflow](../guides/write-a-workflow.md).

### Amy's plugin root

Amy resolves configured plugins only from `~/.amy/plugins` (or
`$AMY_HOME/plugins`). `amy setup` and `amy add` install there with npm's
explicit prefix, so the result does not depend on npm's global prefix or on
where the command itself is installed. Why: [plugins live in amy's home](../design/plugins-live-in-amy-home.md).

If npm exits zero and a package still does not resolve, `setup` says so and
stops, naming it. Check that package under the plugin root and run `amy setup`
again: it offers what the machine already holds, so nothing is asked twice.

### A plugin the config names and nothing installed

Refused at boot, by name, with the list of what there was:

```
amy could not start:
  @amykit/plugin-codex: not installed — install it, or drop it from the config

Installed: @amykit/plugin-claude, @amykit/plugin-file-queue, …
```

`amy doctor` finds that before anything touches a ticket.

### Windows, macOS, Linux

npm puts the `amy` command on the `PATH` with its own shim on each. The shared
brief store takes its lock through the native `fs-ext` module, so installing it
runs a node-gyp build: install your platform's C/C++ build tools and the Node.js
headers for your Node release before `amy setup`.

### Installing from a checkout

Only for working on amy itself, and for the gates that prove an install works
without a registry:

```sh
git clone https://github.com/nicolasmelo1/amy && cd amy
npm ci
npm run install:local     # packs every package, installs to ~/.local/bin/amy
```

`AMY_PACKAGES` takes a subset of the packages to install, which is how the
`installed-plugins` gate builds a machine carrying a handful of packages and a
workflow written elsewhere. See [The gate](../development/the-gate.md).

## Where it keeps things

Everything amy knows lives in one directory:

```text
~/.amy/
├── config.yaml            what to drive, and what to mount
├── .env                   credentials, never committed, never logged
├── skills/                amy's own copy of every skill it ships
├── log/                   the append-only event log, one file per day
├── PAUSED                 the handbrake, while it is pulled
├── plugins/               the npm root every plugin resolves from
├── workflows/             workflows of your own, one directory each
├── profiles/              what belongs to one profile and nothing else
│   └── <name>/
│       ├── config.yaml    this profile's settings, laid over the machine's
│       ├── .env           this profile's keys, on top of the machine's
│       └── forks/         the plugins this profile owns the source of
└── <profile>/             one directory per workflow profile
    ├── records/           one file per piece of work
    └── queue/             one file per queued item
```

`skills/` is written on every install and every update, whether or not a
harness directory was chosen: it is the copy amy owns, the one the chat lends
a skill from, and the first root a step's skill is looked up in. A harness's
own directory (`~/.claude/skills`) is an extra the person asks for with
`amy skills`. The other way round, `harnessSkills: { claude: true }` links each
skill the harness holds into `skills/`, one symlink per skill, at every run and
tick; `false` removes the links, and amy's own copy of a skill always wins.

A workflow keeps its own files in its profile's directory; ticket-to-qa's
`roster.yaml` is one ([the roster belongs to its workflow](../design/the-roster-belongs-to-its-workflow.md)).

**One amy per machine, not one per repository.** It drives work in checkouts all
over the disk and is reached from whichever harness you are in, so its memory
cannot depend on where you typed the command. An `amy status` from the wrong
directory answering "nothing tracked yet" would be a lie with a plausible
explanation.

`AMY_HOME` moves the whole directory. No flag, config key or working directory
does. A second install, a test, or a scratch run uses it:

```sh
AMY_HOME=/tmp/amy-scratch amy status
```

If amy finds an `.amy` directory where you are standing, `amy doctor` reports
it and amy does not adopt it, so the same command answers the same way wherever
you type it.

## Your working directory should not be a repository

amy works on tickets that name real colleagues and real customers. If the
program doing that work ran inside a git repository, any file dropped in the
working directory would be one `git add -A` away from being published. It keeps
nothing where you are standing. Why: [what runs is not this repo](../design/what-runs-is-not-this-repo.md).

A gate proves it: the installed command runs from a directory with no checkout
in it, and the directory is asserted untouched afterwards. See
[The gate](../development/the-gate.md).

## Credentials

Secrets go in `~/.amy/.env`, one per line:

```sh
LINEAR_API_KEY=lin_api_…
```

A profile that should hold its own key, rather than share the machine's, keeps
it in `~/.amy/profiles/<name>/.env`. The order is the one a key is looked up
in, and the first place that has it wins:

```text
exported in the shell
<the directory you ran the command from>/.env   (or AMY_PROJECT_ENV)
~/.amy/profiles/<name>/.env
~/.amy/.env
```

So exporting a key for one command overrides every file, a project-local key
beats the machine's, and a profile's key is not seen by a loop driving another
profile.

Which variables matter depends on which plugins you mount:

<!-- amy:generated environment -->

| Variable | Read by |
| :-- | :-- |
| `AMY_PROJECT_ENV` | `@amykit/cli` |
| `AMY_SUPERVISOR` | `@amykit/cli` |
| `CLAUDE_CODE_OAUTH_TOKEN` | `@amykit/plugin-claude` |
| `CODEX_HOME` | `@amykit/plugin-codex` |
| `LANG` | `@amykit/cli` |
| `LINEAR_API_KEY` | `@amykit/plugin-linear` |
| `NO_COLOR` | `@amykit/cli` |
| `OLLAMA_API_KEY` | `@amykit/plugin-hermes-agent` |
| `PATH` | `@amykit/cli` |
| `TELEGRAM_BOT_TOKEN` | `@amykit/plugin-telegram` |
| `TERM` | `@amykit/cli` |
| `VITEST` | `@amykit/test-fixtures` |

<!-- amy:end environment -->

## Verifying the install

```sh
amy doctor
```

It checks the config, each plugin's settings against the schema that plugin
declared, the checks the mounted packages bring, the credentials, the external
commands, the notification target, and that every configured repository is
checked out. It exits non-zero, so it is safe in a shell profile or a cron
wrapper. See [Status and doctor](status-and-doctor.md).

## Every line names the build that wrote it

```
0.1.0 (83ef192, built 2026-09-03T20:28:44Z)
```

An install built from a tree with uncommitted work stamps `dev`, because it is
not a release anybody can go back to. The stamp goes on every line of the event
log, so "we improved this" and "what failed yesterday" stay comparable across
builds.

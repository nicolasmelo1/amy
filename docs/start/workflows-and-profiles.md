---
title: Workflows and profiles
description: A profile is a name in a config, not a case in a switch — and what that costs.
group: Start here
order: 6
---

# Workflows and profiles

A **workflow** is what happens next, and how each step is done. A **profile** is
a name in your config that points at one, plus what mounts under it.

```yaml
workflows:
  ticket-to-qa:
    workflow: "@amykit/workflow-ticket-to-qa"   # a package
  oncall:
    workflow: oncall                            # a directory on this machine
defaultWorkflow: ticket-to-qa
```

```sh
amy --workflow oncall tick
```

Nothing in amy's own code enumerates what is allowed. `--workflow oncall` works
the moment a config declares `oncall`, because the shipped list is a *default*
rather than an inventory.

## Where a workflow lives

Two places, and the config entry tells them apart by its shape:

| What `workflow:` says | Where it is looked for |
| :-- | :-- |
| A bare name — `oncall` | `~/.amy/workflows/oncall/index.js`, this machine's own directory, first |
| A package name — `@acme/workflow-oncall` | Resolved as an import, like any other package |

A bare name that has no directory falls through to the same import, so a
workflow can start as yours and become a package later without the profile
changing.

```sh
amy workflow new oncall      # writes the directory, and the profile above
amy workflow check oncall    # drives its lifecycle before it drives real work
```

That is the shorter road, and the one to take first: what `new` writes already
runs, so the editing starts from a workflow that moves rather than from an empty
file. [Write a workflow](../build/write-a-workflow.md) goes through what it
wrote and what to change.

## What ships in the box

<!-- amy:generated workflow-index -->

| Workflow | Profile name | States | What it does |
| :-- | :-- | :-- | :-- |
| `@amykit/plugin-prove` | `prove` | 7 | Proves a phase against the real system: one workflow walks the scenario each brief settled, through the operations the mounted plugins offer. |
| `@amykit/workflow-errand` | `errand` | 5 | Something said in passing becomes work: capture it, do it, say what happened. |
| `@amykit/workflow-feature-grooming` | `feature-grooming` | 2 | Feature grooming against read-only base-branch source snapshots. |
| `@amykit/workflow-note-to-plan` | `note-to-plan` | 6 | The note-to-plan workflow: friction becomes a plan in the repository it is about. |
| `@amykit/workflow-pull-request` | `pull-request` | 3 | A workflow other workflows call: open a pull request for a branch, through whichever code host is mounted. |
| `@amykit/workflow-setup` | `setup` | 10 | Onboarding as an amy workflow: amy setup walks a fresh machine through harness, workflow and channels, one ask at a time. |
| `@amykit/workflow-ticket-to-qa` | `ticket-to-qa` | 19 | The ticket-to-QA workflow: its states, its typed port contracts, and a pure plan(). |

<!-- amy:end workflow-index -->

A config that names one of those replaces it. A config that names a fourth gets
a fourth.

## What is shared, and what is not

```text
~/.amy/
├── events.jsonl          shared — one log, therefore one budget
├── stop                  shared — one handbrake stops whichever is running
├── ticket-to-qa/
│   ├── records/          per profile
│   └── queue/            per profile
└── note-to-plan/
    ├── records/
    └── queue/
```

**Records and the queue are per profile.** Swapping which workflow you drive
never costs you the other one's state.

**Everything else is shared**, and that is deliberate. One event log means one
budget: two workflows spending the same subscription cannot each believe they
have the whole ceiling. One handbrake means `amy pause` means what it says.

## One workflow per invocation

`mount()` claims a single workflow, so `--workflow` chooses which. That is a
real constraint and worth understanding: it is not that amy can only drive one
workflow, it is that one *process* drives one. The loop for a second profile is
a second `amy start --workflow other`.

What is *not* duplicated is everything underneath. The same engine, the same
relay, the same forge, the same queue implementation, the same log. Adding the
third shipped workflow cost a package and changed nothing the first two use.

## Managing profiles

```sh
amy workflow list                 # every workflow this install can drive, and what each holds
amy workflow rm oncall --yes      # forget one: records, queue, config entry
amy plugin list                   # what is installed, and what this profile mounts
amy plugin add @acme/plugin-jira
amy plugin remove @amykit/plugin-codex
```

`amy workflow rm` needs `--yes` because it deletes records. Without it, it says
what would go.

## What a profile mounts

Leaving `plugins:` out of a profile mounts the recommended set for that
workflow: the shared infrastructure every profile needs, plus whatever that
workflow depends on. Listing plugins explicitly replaces the whole set, in the
order given.

```yaml
workflows:
  minimal:
    workflow: "@acme/workflow-oncall"
    plugins:
      - "@amykit/plugin-file-queue"
      - "@amykit/plugin-file-store"
      - "@amykit/plugin-serial-engine"
      - "@acme/plugin-pagerduty"
```

Order does not matter for collections — a plugin that composes others reads them
when it is used, not when it is mounted — but a missing one is refused at boot
with the list of what would have failed. See
[Plugins and the registry](../concepts/plugins.md).

## A plugin of your own

A workflow publishes the ports it needs; which plugin answers each one is the
installation's choice, and two profiles can choose differently. `amy add` takes
a plugin into the selected profile in one of two ways:

```sh
amy add @amykit/plugin-linear              # the published package (the default)
amy --workflow oncall add @amykit/plugin-linear --fork   # its source, yours to edit
amy add 'git+https://github.com/acme/tools.git#v2&path:plugins/jira' --fork
```

A **fork** is the package's source, fetched from the repository its
`package.json` names (`repository.url` and `repository.directory`), at the tag
its installed version was released under, `<name>@<version>`. A git URL that
names a directory with `#path:` forks the same way without asking the registry.
A package with no `repository`, or a tag that is not there, is refused before
anything is written.

The fork keeps the package's name, so nothing names where it lives: the config
still says `@amykit/plugin-linear`, and the profile's own npm root under
`~/.amy/plugins/profiles/<profile>` maps that name to the fork — under
`dependencies`, and under `overrides` for any installed workflow that imports
it itself. Every other profile keeps the published package. The core and the
command are never forked: every profile resolves them from amy's own root.

| The profile drives | Where the fork goes |
| :-- | :-- |
| A workflow of your own | Inside its project, under `forks/`, outside what it publishes |
| A workflow somebody published | `~/.amy/profiles/<profile>/forks/`, moved by `AMY_HOME` |

`--to <dir>` puts one fork somewhere else, and two settings in `config.yaml`
change the defaults:

```yaml
add: fork          # what `amy add <package>` does with no flag: fork | package
forks: ~/forks     # where forks go, one directory per profile
```

Edit the fork and the next boot builds it with its own build script, and a
running loop remounts it between two ticks — never during one. A build that
fails refuses the boot by name, and a running loop keeps the mount it had.

`amy update` merges the plugin's new release into the fork three ways — the
version it was taken from, your fork, and the new one — so your edits stay and
the release's changes arrive. A line you both changed stops the update for the
whole machine before anything moves: the fork is left exactly as it was, and
the marked merge is written beside it, at `<fork>.merge`. `amy remove` of a
forked name gives the profile the published package back and leaves the fork's
directory where it is.

Every published package also carries a [shadcn](https://ui.shadcn.com)
registry item under `registry/`, so `npx shadcn add` can copy the same source.
It only copies: recording a base and merging the next release is amy's.

## Writing your own

The point is the workflows that cannot be shared: a process that names your
employer's tooling, a private feedback step, an on-call rota. Those live in a
package of yours, versioned wherever you like, and amy mounts them exactly the
way it mounts its own.

- [Write a workflow](../build/write-a-workflow.md) — the full walkthrough.
- `/amy-workflow` designs one by interrogating you a question at a time.

---
title: Workflows and profiles
description: A profile is a name in your config that points at a workflow, and what mounts under it.
group: Start here
order: 6
---

# Workflows and profiles

A **workflow** is what happens next, and how each step is done. A **profile** is
a name in your config that points at one, plus what mounts under it.
[Project, workflow, plugin](../guides/project-workflow-plugin.md) sets these
words beside each other.

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

Nothing in amy's own code lists what is allowed, and a fresh install declares no
profile at all. `--workflow oncall` works the moment the config declares
`oncall`.

## Where a workflow lives

The config entry's shape says where to look:

| What `workflow:` says | Where it is looked for |
| :-- | :-- |
| A bare name, `oncall` | `~/.amy/workflows/oncall/index.ts` (or `index.js`) first |
| A package name, `@acme/workflow-oncall` | Resolved as an import from `~/.amy/plugins` |

A bare name with no directory falls through to the same import, so a workflow
can start as yours and become a package later without the profile changing.
Why: [a workflow is yours, not a package](../design/a-workflow-is-yours-not-a-package.md).

```sh
amy workflow new oncall      # writes the directory, and the profile above
amy workflow check oncall    # drives its lifecycle against a stub world
```

What `new` writes already runs, so editing starts from a workflow that moves.
[Write a workflow](../guides/write-a-workflow.md) goes through it, and
[compose workflows](../guides/compose-workflows.md) covers a workflow that calls
another.

## What is published

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

None of these is installed until you choose it. `amy add <package>` installs
one and writes its profile; the profile name is the package name without
`workflow-`. Why: [amy add and amy remove](../design/amy-add-and-amy-remove.md).

## What is shared, and what is not

```text
~/.amy/
├── log/                  shared: one log, therefore one budget
├── PAUSED                shared: one handbrake for the machine
├── ticket-to-qa/
│   ├── records/          per profile
│   └── queue/            per profile
└── note-to-plan/
    ├── records/
    └── queue/
```

**Records and the queue are per profile.** Switching the workflow you drive
never costs the other one's state.

**The rest is shared.** One event log means one budget: workflows spending
the same subscription cannot each believe they have the whole ceiling. One
handbrake means `amy stop --all` stops the machine.

## A profile's own config

The machine's `~/.amy/config.yaml` may cover both profiles, but a setting only
one of them wants belongs in that profile's own file:

```text
~/.amy/
├── config.yaml                  workflows, defaultWorkflow, and what both share
└── profiles/
    ├── ticket-to-qa/
    │   ├── config.yaml          this profile's settings, laid over the machine's
    │   └── .env                 this profile's keys
    └── oncall/
        ├── config.yaml
        └── .env
```

```yaml
# ~/.amy/profiles/oncall/config.yaml
plugins:
  "@amykit/plugin-linear":
    workingStatusName: On Call
```

The profile reads the machine's file with its own over it: mappings merge key by
key, and a list or a scalar replaces the machine's value whole. A profile with
no file reads exactly the machine's, and `amy --workflow other` never sees what
`oncall` wrote. `workflows:` and `defaultWorkflow` stay in the machine's file, because they
are the list of profiles, so a profile file naming either is refused at boot,
naming the file and the key. Why: [a profile keeps its own
config](../design/a-profile-keeps-its-own-config.md).

## One workflow per process

A process drives one profile, so `--workflow` chooses which. The loop for a
second profile is a second `amy --workflow other start`. What sits underneath
is not duplicated: the same engine, relay, forge, queue implementation and log
serve every profile.

## Managing profiles

```sh
amy workflow list                 # every workflow this install can drive
amy plugin list                   # what this profile mounts, and what it assembled into
amy add @acme/plugin-jira         # install a plugin and mount it
amy remove @amykit/plugin-codex   # unmount it, refusing what the machine would not survive
amy remove oncall                 # forget a profile: its config entry, records and queue
```

`amy remove` of a profile asks before it deletes records; `--yes` skips the
question and `--keep-state` keeps them. Every option is in the
[CLI reference](../reference/cli.md).

## What a profile mounts

Leaving `plugins:` out of a profile mounts the recommended set for its workflow:
the shared infrastructure every profile needs, plus what that workflow depends
on. Listing plugins replaces the whole set:

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

The order of that list does not matter: the mount builds once, after every
plugin has registered ([a mount builds once](../design/a-mount-builds-once.md)).
A missing one is refused at boot with the list of what would have failed. See
[Plugins and the registry](../concepts/plugins.md).

## A fork of a plugin

A workflow says which ports it needs; which plugin answers each one is the
profile's choice, and each profile can choose differently. `amy add --fork`
takes a plugin's source instead of the published package, as code the profile
owns:

```sh
amy --workflow oncall add @amykit/plugin-linear --fork
```

The fork keeps the package's name, so the config does not change. The next boot
builds it, a running loop remounts it between ticks, and `amy update` merges the
plugin's next release into it, keeping your edits. Where forks go, how the
merge works and what `--to` and the `add`/`forks` settings change are in
[Install a plugin](../guides/install-a-plugin.md). Why: [a plugin is installed into a workflow](../design/a-plugin-is-installed-into-a-workflow.md),
[amy update](../design/amy-update.md) and
[an update keeps the workflow current](../design/an-update-keeps-the-workflow-current.md).

## Writing your own

The workflows nobody else can share are the reason for all this: a process that
names your employer's tooling, a private feedback step, an on-call rota. They
live in a directory or a package of yours, and amy mounts them the way it mounts
its own.

- [Write a workflow](../guides/write-a-workflow.md), the walkthrough.
- `/amy-workflow` designs one by asking you a question at a time.

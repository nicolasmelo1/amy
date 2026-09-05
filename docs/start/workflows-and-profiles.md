---
title: Workflows and profiles
description: A profile is a name in a config, not a case in a switch — and what that costs.
group: Start here
order: 6
---

# Workflows and profiles

A **workflow** is a package: what happens next, and how each step is done. A
**profile** is a name in your config that points at one, plus what mounts under
it.

```yaml
workflows:
  ticket-to-qa:
    workflow: "@amykit/workflow-ticket-to-qa"
  oncall:
    workflow: "@acme/workflow-oncall"     # a package this repository never shipped
defaultWorkflow: ticket-to-qa
```

```sh
amy --workflow oncall tick
```

Nothing in amy's own code enumerates what is allowed. `--workflow oncall` works
the moment a config declares `oncall`, because the shipped list is a *default*
rather than an inventory.

## What ships in the box

<!-- amy:generated workflow-index -->

| Workflow | Profile name | States | What it does |
| :-- | :-- | :-- | :-- |
| `@amykit/workflow-errand` | `errand` | 5 | Something said in passing becomes work: capture it, do it, say what happened. |
| `@amykit/workflow-note-to-plan` | `note-to-plan` | 6 | The note-to-plan workflow: friction becomes a plan in the repository it is about. |
| `@amykit/workflow-ticket-to-qa` | `ticket-to-qa` | 16 | The ticket-to-QA workflow: its states, its typed port contracts, and a pure plan(). |

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

## Writing your own

The point is the workflows that cannot be shared: a process that names your
employer's tooling, a private feedback step, an on-call rota. Those live in a
package of yours, versioned wherever you like, and amy mounts them exactly the
way it mounts its own.

- [Write a workflow](../build/write-a-workflow.md) — the full walkthrough.
- `/amy-workflow` designs one by interrogating you a question at a time.

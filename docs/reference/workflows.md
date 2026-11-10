---
title: Workflows
description: Every shipped workflow, its states, where it waits, and what it emits.
group: Reference
order: 3
---

# Workflow reference

Read out of each workflow as amy mounts it: its states come from the
`workflow.mmd` beside it, and the actions from what its single `defineWorkflow`
declares. Why a workflow is one declaration over one diagram:
[a workflow is one declaration](../design/a-workflow-is-one-declaration.md).
How one workflow calls another, as `PR_OPEN` calls `pull-request`:
[a workflow calls another](../design/a-workflow-calls-another.md).

## Every shipped workflow

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

## In detail

<!-- amy:generated workflow-states -->

### `@amykit/plugin-prove`

Proves a phase against the real system: one workflow walks the scenario each brief settled, through the operations the mounted plugins offer.

|  |  |
| :-- | :-- |
| Profile name | `prove` |
| Source | `plugins/prove` |
| Starts in | `READING` |
| Terminal | `refused`, `PROVEN` |
| Waits in | `READING`, `LEASING`, `ASKING` |
| Actions it emits | `ask`, `escalate`, `finish`, `lease`, `prepare`, `renew`, `run-step` |

| # | State | Kind |
| :-- | :-- | :-- |
| 1 | `READING` | initial, waiting |
| 2 | `LEASING` | waiting |
| 3 | `PREPARING` | working |
| 4 | `refused` | terminal |
| 5 | `RUNNING` | working |
| 6 | `ASKING` | waiting |
| 7 | `PROVEN` | terminal |

### `@amykit/workflow-errand`

Something said in passing becomes work: capture it, do it, say what happened.

|  |  |
| :-- | :-- |
| Profile name | `errand` |
| Source | `examples/workflow-errand` |
| Starts in | `QUEUED` |
| Terminal | `DONE`, `DECLINED` |
| Waits in | `QUEUED` |
| Actions it emits | `announce`, `open-pull-request`, `run-errand` |

| # | State | Kind |
| :-- | :-- | :-- |
| 1 | `QUEUED` | initial, waiting |
| 2 | `WORKING` | working |
| 3 | `PR_OPEN` | working |
| 4 | `DONE` | terminal |
| 5 | `DECLINED` | terminal |

### `@amykit/workflow-feature-grooming`

Feature grooming against read-only base-branch source snapshots.

|  |  |
| :-- | :-- |
| Profile name | `feature-grooming` |
| Source | `examples/workflow-feature-grooming` |
| Starts in | `GROOMING` |
| Terminal | `BRIEFED` |
| Waits in | `GROOMING` |
| Actions it emits |  |

| # | State | Kind |
| :-- | :-- | :-- |
| 1 | `GROOMING` | initial, waiting |
| 2 | `BRIEFED` | terminal |

### `@amykit/workflow-note-to-plan`

The note-to-plan workflow: friction becomes a plan in the repository it is about.

|  |  |
| :-- | :-- |
| Profile name | `note-to-plan` |
| Source | `examples/workflow-note-to-plan` |
| Starts in | `NOTED` |
| Terminal | `DONE`, `DECLINED` |
| Waits in | `NOTED` |
| Actions it emits | `announce`, `check-plan`, `draft-plan`, `open-pull-request` |

| # | State | Kind |
| :-- | :-- | :-- |
| 1 | `NOTED` | initial, waiting |
| 2 | `DRAFTED` | working |
| 3 | `CHECKED` | working |
| 4 | `PR_OPEN` | working |
| 5 | `DONE` | terminal |
| 6 | `DECLINED` | terminal |

### `@amykit/workflow-pull-request`

A workflow other workflows call: open a pull request for a branch, through whichever code host is mounted.

|  |  |
| :-- | :-- |
| Profile name | `pull-request` |
| Source | `examples/workflow-pull-request` |
| Starts in | `OPENING` |
| Terminal | `OPENED`, `REFUSED` |
| Waits in | _nowhere_ |
| Actions it emits | `open-pull-request` |

| # | State | Kind |
| :-- | :-- | :-- |
| 1 | `OPENING` | initial |
| 2 | `OPENED` | terminal |
| 3 | `REFUSED` | terminal |

### `@amykit/workflow-setup`

Onboarding as an amy workflow: amy setup walks a fresh machine through harness, workflow and channels, one ask at a time.

|  |  |
| :-- | :-- |
| Profile name | `setup` |
| Source | `packages/workflow-setup` |
| Starts in | `DETECTING` |
| Terminal | `DONE`, `STOPPED` |
| Waits in | `HARNESS`, `WORKFLOW`, `CHANNELS`, `CONFIGURING` |
| Actions it emits | `ask-setting`, `check`, `install`, `pending`, `ping`, `post`, `read-config`, `setup`, `write-ladder`, `write-settings`, `write-setup-profile`, `write-workflow` |

| # | State | Kind |
| :-- | :-- | :-- |
| 1 | `DETECTING` | initial |
| 2 | `HARNESS` | waiting |
| 3 | `PLUGIN_INSTALLED` | working |
| 4 | `PINGED` | working |
| 5 | `WORKFLOW` | waiting |
| 6 | `CHANNELS` | waiting |
| 7 | `CONFIGURING` | waiting |
| 8 | `CHECKED` | working |
| 9 | `DONE` | terminal |
| 10 | `STOPPED` | terminal |

### `@amykit/workflow-ticket-to-qa`

The ticket-to-QA workflow: its states, its typed port contracts, and a pure plan().

|  |  |
| :-- | :-- |
| Profile name | `ticket-to-qa` |
| Source | `examples/workflow-ticket-to-qa` |
| Starts in | `DISCOVERED` |
| Terminal | `DONE` |
| Waits in | `CLARIFYING`, `COPILOT_WAIT`, `HUMAN_REVIEW`, `ESCALATED` |
| Actions it emits | `address-threads`, `announce`, `ask-question`, `assign-reviewer`, `discuss`, `escalate`, `hand-off-to-qa`, `implement`, `open-pull-request`, `request-rereview`, `resolve-review-thread`, `run-gate`, `self-review`, `triage` |

| # | State | Kind |
| :-- | :-- | :-- |
| 1 | `DISCOVERED` | initial |
| 2 | `CLARIFYING` | waiting |
| 3 | `READY` | working |
| 4 | `IMPLEMENTING` | working |
| 5 | `checks` | working |
| 6 | `GATE` | working |
| 7 | `SELF_REVIEW` | working |
| 8 | `verdict` | working |
| 9 | `PR_OPEN` | working |
| 10 | `COPILOT_WAIT` | waiting |
| 11 | `COPILOT_FIX` | working |
| 12 | `REVIEWER_ASSIGNED` | working |
| 13 | `HUMAN_REVIEW` | waiting |
| 14 | `HUMAN_FIX` | working |
| 15 | `ESCALATED` | waiting |
| 16 | `RE_REVIEW` | working |
| 17 | `APPROVED` | working |
| 18 | `QA_HANDOFF` | working |
| 19 | `DONE` | terminal |

<!-- amy:end workflow-states -->

## What a state's kind means

| Kind | In `workflow.mmd` | The engine's behaviour |
| :-- | :-- | :-- |
| **initial** | `[*] --> STATE` | The state a new record starts in. |
| **working** | any other state | Something is due. The next look is queued as soon as this one finishes. |
| **waiting** | `class STATE waiting` | Nothing to do until the outside world moves. A `wait` decision queues the next look after the delay it names, usually read from the workflow's policy. |
| **terminal** | `STATE --> [*]` | Its decision settles, and nothing further is queued. |

A workflow with no waiting state is a busy loop that burns quota politely; a
workflow with no terminal refusal makes giving up look exactly like landing. See
[Write a workflow](../guides/write-a-workflow.md).

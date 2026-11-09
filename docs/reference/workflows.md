---
title: Workflows
description: Every shipped workflow — its states, where it waits, and what it emits.
group: Reference
order: 3
---

# Workflow reference

Read out of each workflow's own machine object: the states it declares, which of
them wait, which are terminal, and the actions it says it can emit.

## Every shipped workflow

<!-- amy:generated workflow-index -->

| Workflow | Profile name | States | What it does |
| :-- | :-- | :-- | :-- |
| `@amykit/plugin-prove` | `prove` | 7 | Proves a phase against the real system: one workflow walks the scenario each brief settled, through the operations the mounted plugins offer. |
| `@amykit/workflow-errand` | `errand` | 5 | Something said in passing becomes work: capture it, do it, say what happened. |
| `@amykit/workflow-feature-grooming` | `feature-grooming` | 2 | Feature grooming against read-only base-branch source snapshots. |
| `@amykit/workflow-note-to-plan` | `note-to-plan` | 6 | The note-to-plan workflow: friction becomes a plan in the repository it is about. |
| `@amykit/workflow-pull-request` | `pull-request` | 3 | A workflow other workflows call: open a pull request for a branch, through whichever code host is mounted. |
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

| Kind | The engine's behaviour |
| :-- | :-- |
| **initial** | The state a new record starts in. |
| **working** | Something is due. The next look is queued immediately after this one finishes. |
| **waiting** | Nothing to do until the outside world moves. The next look is queued with a delay from the workflow's policy. |
| **terminal** | Nothing further is queued. The record is settled. |

A workflow with no waiting state is a busy loop that burns quota politely; a
workflow with no terminal refusal makes giving up look exactly like landing. See
[Write a workflow](../build/write-a-workflow.md).

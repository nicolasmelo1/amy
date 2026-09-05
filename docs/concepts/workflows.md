---
title: Workflows
description: Two halves — a pure decision and a runtime — and the seven things a workflow declares.
group: How it works
order: 2
---

# Workflows

A workflow is **the order in which actions happen, plus how each one runs**. It
comes in two halves, and keeping them apart is the single most important thing
about this codebase.

```text
   plan()                              the runtime
   ────────                            ───────────
   pure, synchronous                   async, touches the world
   says WHAT should happen             says HOW it is done
   (record, observation, policy)       observe(), handlers(), apply()
        → Plan
```

## The decision half

```ts
plan(record, observation, policy): Plan
```

It reads a persisted record and a snapshot of the outside world, and returns one
of four things:

<!-- amy:generated plan-kinds -->

| Kind | Fields | What it means |
| :-- | :-- | :-- |
| `act` | `kind: "act"`<br>`effects: Action[]`<br>`why: string` | Do the work, stay in this state, and look again straight away. The next look sees whatever the actions recorded, which is how a pure decision function drives work that takes minutes or hours. |
| `advance` | `kind: "advance"`<br>`to: string`<br>`effects: Action[]`<br>`why: string` |  |
| `wait` | `kind: "wait"`<br>`retryAfterMs: number`<br>`why: string`<br>`effects: Action[]` | Nothing to do until the outside world moves. May still carry actions, so a workflow can say why it is stuck without leaving the state. |
| `settled` | `kind: "settled"`<br>`why: string` | Terminal, do not queue anything else. |

<!-- amy:end plan-kinds -->

It touches no tracker, no code host, no repository and no agent. If you find
yourself wanting to `await` something inside `plan()`, the thing you want
belongs in the runtime.

**What purity buys.** A sixteen-state lifecycle, including the paths where a
review requests changes and where the agent disagrees with a reviewer, is walked
end to end in a test in milliseconds with no I/O. That test is the one that
finds the bugs, and it only exists because the function is pure.

## The runtime half

The runtime is `WorkflowRuntime`, and it says four things the engine cannot
know:

| Member | What it answers |
| :-- | :-- |
| `found()` | What work exists that is not on the queue yet |
| `newRecord(workId, now)` | What a record looks like before anything has happened |
| `observe(record)` | What the outside world looks like, for this record, right now |
| `handlers()` | One function per action this workflow can emit |
| `apply(record, plan, outcomes, observation, now)` | How what happened folds back into the record |
| `policy` | The numbers `plan()` is given — attempt ceilings, backoffs, how many open reviews one person may carry |

`apply` is the subtle one. The engine has already folded the state, the attempt
count and the history through `applyPlan`; it cannot fold the rest, because it
does not know what a triage result or a gate result is. The **observation** is
passed to it too, because not everything a record learns comes from an action —
an answer somebody left on a ticket arrives as an observation, and a fold that
could not see one would leave the record waiting on it forever.

## The seven things a workflow declares

```ts
export const errand: Workflow<Observation, Policy> = {
  name: "errand",
  states: ERRAND_STATES,
  waitingStates: WAITING_STATES,
  initialState: "QUEUED",
  terminalStates: ["DONE", "DECLINED"],
  usesActions: USES_ACTIONS,
  usesObservers: [],
  plan: (record, observation, policy) => plan(record as ErrandRecord, observation, policy),
};
```

**`states`** — the strings this lifecycle can be in. The core treats each one as
a label.

**`waitingStates`** — where the machine has nothing to do until somebody else
moves. Kept explicit so the engine backs off instead of spinning, and so a new
state cannot silently become a busy loop.

**`terminalStates`** — where work stops being queued.

**`usesActions`** and **`usesObservers`** — the workflow's *reach*, declared as
data so the host can refuse a mount where an action has no port behind it. This
is the surface something can measure without reading the logic.

**`plan`** — the pure function. The cast from the core's generic `WorkRecord` to
the workflow's own type happens here and nowhere else: one boundary per
workflow.

## Effects are described, never performed

The machine emits an effect; the runtime's handler performs it. Nothing about
that is a formality — it is what keeps "what was decided" and "what the world
did" separable, and therefore separately testable.

A workflow declares its own typed view of the actions it composes:

```ts
export type Effect =
  | { type: "triage" }
  | { type: "ask-question"; questions: string[] }
  | { type: "implement"; retryContext?: string }
  | { type: "run-gate" }
  | { type: "announce"; text: string };
```

The core owns the *names* and how each one is dispatched. The *payload* each one
carries in this workflow lives here, which is what lets the decision function
stay type-checked while the core stays ignorant.

## Attempts, and why `advance` does not count

`applyPlan` counts an attempt for `act` and `wait`, and not for `advance`.

Work done *inside* a state is counted, so every retry loop is bounded. Actions
carried by an `advance` are one-shot transition actions and are not retried, so
counting them would make a lifecycle that moves forward look like one that is
stuck.

This is also where the second-workflow defect showed up: every runtime was
folding the plan into the record twice, so every retry counted as two, and the
`maxAttempts` ceiling fired at half its configured value.

## The shipped workflows

<!-- amy:generated workflow-states -->

### `@amykit/workflow-errand`

Something said in passing becomes work: capture it, do it, say what happened.

|  |  |
| :-- | :-- |
| Profile name | `errand` |
| Source | `packages/workflow-errand` |
| Starts in | `QUEUED` |
| Terminal | `DONE`, `DECLINED` |
| Waits in | `QUEUED` |
| Actions it emits | `announce`, `open-pull-request`, `run-errand` |
| Observations it reads | _none_ |

| # | State | Kind |
| :-- | :-- | :-- |
| 1 | `QUEUED` | initial, waiting |
| 2 | `WORKING` | working |
| 3 | `PR_OPEN` | working |
| 4 | `DONE` | terminal |
| 5 | `DECLINED` | terminal |

### `@amykit/workflow-note-to-plan`

The note-to-plan workflow: friction becomes a plan in the repository it is about.

|  |  |
| :-- | :-- |
| Profile name | `note-to-plan` |
| Source | `packages/workflow-note-to-plan` |
| Starts in | `NOTED` |
| Terminal | `DONE`, `DECLINED` |
| Waits in | `NOTED` |
| Actions it emits | `announce`, `check-plan`, `draft-plan`, `open-pull-request` |
| Observations it reads | _none_ |

| # | State | Kind |
| :-- | :-- | :-- |
| 1 | `NOTED` | initial, waiting |
| 2 | `DRAFTED` | working |
| 3 | `CHECKED` | working |
| 4 | `PR_OPEN` | working |
| 5 | `DONE` | terminal |
| 6 | `DECLINED` | terminal |

### `@amykit/workflow-ticket-to-qa`

The ticket-to-QA workflow: its states, its typed port contracts, and a pure plan().

|  |  |
| :-- | :-- |
| Profile name | `ticket-to-qa` |
| Source | `packages/workflow-ticket-to-qa` |
| Starts in | `DISCOVERED` |
| Terminal | `DONE` |
| Waits in | `CLARIFYING`, `COPILOT_WAIT`, `HUMAN_REVIEW`, `ESCALATED` |
| Actions it emits | `address-threads`, `announce`, `ask-question`, `assign-reviewer`, `escalate`, `hand-off-to-qa`, `implement`, `open-pull-request`, `request-rereview`, `run-gate`, `triage` |
| Observations it reads | _none_ |

| # | State | Kind |
| :-- | :-- | :-- |
| 1 | `DISCOVERED` | initial |
| 2 | `CLARIFYING` | waiting |
| 3 | `READY` | working |
| 4 | `IMPLEMENTING` | working |
| 5 | `CHECKED` | working |
| 6 | `PR_OPEN` | working |
| 7 | `COPILOT_WAIT` | waiting |
| 8 | `COPILOT_FIX` | working |
| 9 | `REVIEWER_ASSIGNED` | working |
| 10 | `HUMAN_REVIEW` | waiting |
| 11 | `HUMAN_FIX` | working |
| 12 | `ESCALATED` | waiting |
| 13 | `RE_REVIEW` | working |
| 14 | `APPROVED` | working |
| 15 | `QA_HANDOFF` | working |
| 16 | `DONE` | terminal |

<!-- amy:end workflow-states -->

## Writing one

[Write a workflow](../build/write-a-workflow.md) is the full walkthrough, from an
empty package to a walkthrough test. `/amy-workflow` designs one by
interrogating you a question at a time.

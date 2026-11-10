---
title: Actions
description: The catalogue the core owns, what a workflow declares for each action it emits, and when to add one.
group: How it works
order: 6
---

# Actions

An **action** is something a decision asks for and the world does: run the
gate, ask the agent, open a pull request. A plan carries it by name, with a
payload. The core's catalogue says which port each name runs on:

```ts
import { CORE_ACTIONS } from "@amykit/core";

const gate = CORE_ACTIONS["run-gate"]; // { port: "gate", method: "run" }
```

## Why a shared catalogue

A second workflow that needs `implement` reuses the core's `implement` and the
port behind it. It does not declare its own, which would drag a domain along,
and it does not import the first workflow, which would tie the workflows to
each other.

`draft-plan` and `run-errand` are the evidence. Both dispatch to `agent.ask()`:
a prompt goes in, an account of what it cost comes back. The note-to-plan and
errand workflows each want an agent working in a checkout under a name of their
own, so `ask` moved from a guess to a fact, and both prompts reach the same
ladder and the same ceiling.

## The catalogue

<!-- amy:generated core-actions -->

| Action | Port | Method | Shipped by | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `acquire-worktree` | `worktree` | `acquire()` | `@amykit/core` | An isolated checkout for one piece of work, created or reused. |
| `address-threads` | `agent` | `ask()` | `@amykit/core` |  |
| `announce` | `notifier` | `announce()` | `@amykit/core` |  |
| `ask-question` | `tracker` | `comment()` | `@amykit/core` |  |
| `assign-reviewer` | `code-host` | `requestReview()` | `@amykit/core` |  |
| `discuss` | `agent` | `ask()` | `@amykit/core` | Answer a person's turn in a discussion, before anything is decided. |
| `draft-plan` | `agent` | `ask()` | `@amykit/core` | Ask the agent for a piece of writing, in whoever asked's own words. |
| `escalate` | `tracker` | `createFollowUp()` | `@amykit/core` |  |
| `hand-off-to-qa` | `tracker` | `setStatus()` | `@amykit/core` |  |
| `hand-over` | `notifier` | `announce()` | `@amykit/core` | A write handed to the operator instead of made: said once, in the work's thread when there is one and the notifier otherwise, so the operator can make it where a team reads. Dispatched to the notifier, which every install mounts, because the thread is optional and the turn is not. |
| `implement` | `agent` | `ask()` | `@amykit/core` |  |
| `open-pull-request` | `code-host` | `openPullRequest()` | `@amykit/core` |  |
| `request-rereview` | `code-host` | `requestReview()` | `@amykit/core` |  |
| `resolve-review-thread` | `code-host` | `resolveReviewThread()` | `@amykit/core` | Close one review thread, by its id. |
| `run-errand` | `agent` | `ask()` | `@amykit/core` | Do the thing somebody asked for, in their own words. |
| `run-gate` | `gate` | `run()` | `@amykit/core` |  |
| `self-review` | `agent` | `ask()` | `@amykit/core` | A workflow-declared half-step: the work reviews itself before a person is asked to. |
| `triage` | `agent` | `ask()` | `@amykit/core` |  |
| `check-plan` | `plan-check` | `check()` | `@amykit/plugin-plan-check` | Registered by the plugin that brings the port behind it. |
| `run-command` | `commands` | `run()` | `@amykit/plugin-command` | Registered by the plugin that brings the port behind it. |

<!-- amy:end core-actions -->

## What a workflow declares

A workflow's `actions` has one entry per action its decisions may emit. The key
is the name; the value is a handler the workflow wrote, or `{ port, method }`
for a port method the host calls with the action and its context:

```ts
import { workflowActions } from "@amykit/core";

type Effect =
  | { type: "page-oncall"; who: string; why: string }
  | { type: "announce"; text: string };

export const actions = workflowActions<Effect>()({
  // Each handler is handed only its own member of Effect.
  "page-oncall": async ({ operate }, _work, effect) => {
    await operate("pager.page", { who: effect.who, why: effect.why });
  },
  announce: async ({ announce }, _work, effect) => announce(effect.text),
});
```

Declaring and implementing are the same entry, so they cannot disagree, and
the host answers at boot, before any work, whether each one can run:

```text
amy could not start:
  action `hand-off-to-qa` is declared with no implementation — give it a handler, or a port and a method
  action `triage`: needs the `agent` port, which nothing mounted
  action `check-plan`: `plan-check.check` takes its own arguments, not an action — write a handler that calls it, or mark it with `acceptsAction`
```

A `{ port, method }` reaches only a method its port marked with
`acceptsAction`. A method written for its own arguments would be handed an
action where it expects a repository and run wrong, so it is called from a
handler instead.

A handler runs an action the catalogue names, because the catalogue tells the
budget which actions spend an agent and the tracker check which ones write. A
`{ port, method }` names its own port, so it may run an action nobody
catalogued, but not one the catalogue sends to a different port. A plan naming
an action the map does not have is refused by the engine before any of that
plan's actions run.

A handler is given its ports bound to the work, so every agent reply is logged
for the budget; `announce(text)`, a word to the operator whose failure is a
`notify.failed` line rather than a failed action; and `operate(id, input)`,
which calls a mounted plugin's operation by id, validated against its schema.

## The payload lives in the workflow

The core owns the name. Its `Action` is `{ type: string }` plus anything. The
payload an action carries is the workflow's own `Effect` union, and
`workflowActions<Effect>()` hands each handler only its own member. So the
decisions stay type-checked over the workflow's vocabulary while the core stays
ignorant of it.

## Adding an action

The question is whether anything outside your package wants it.

**A plugin action.** Your plugin registers the action and the port that runs
it, in the same package, with `registry.action(name, { port, method }, impl)`.
It works at once and you can publish it. See [Ports](ports.md#a-port-the-core-has-never-heard-of).

**A core action.** Adding to `CORE_ACTIONS` changes amy itself, and the bar is
a second consumer. An action in the core with one user is a domain the core
learned for nothing, which is what `L0.CORE_STAYS_IGNORANT` exists to prevent.

So ship it in your plugin, and if a second workflow wants it, it graduates by
evidence.

## Actions do not decide anything

A decision describes an action and what the workflow declared for it runs it.
The decision never performs one, and the handler never decides whether to. That
is why a lifecycle can be walked in a test with no I/O, and why a handler can be
tested against a scripted world with no state machine near it.

---
title: Actions
description: The catalogue the core owns, why a workflow composes rather than defines, and when to add one.
group: How it works
order: 5
---

# Actions

An **action** is a name plus the port it dispatches to. That is all the core
knows about one.

```ts
"run-gate": { port: "gate", method: "run" }
```

A workflow *orders* actions. It does not define them.

## Why composing and not defining

This is the constraint that makes a second workflow cheap.

If a workflow defined its own actions, then a second workflow that needed
`implement` would either declare its own — and drag a whole domain along with it
— or import the first workflow, which puts a dependency between two things that
should not know about each other. Composing from a shared catalogue means the
second workflow reuses the action *and* the port behind it, and the two
workflows stay strangers.

The evidence is `draft-plan` and `run-errand`. Both dispatch to
`agent.ask()` — a prompt goes in, an account of what it cost comes back. Two
workflows now want an agent working in a checkout under a name of their own, and
neither wants the other's. That moved `ask` from a guess to a fact.

## The catalogue

<!-- amy:generated core-actions -->

| Action | Port | Method | Shipped by | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `acquire-worktree` | `worktree` | `acquire()` | `@amykit/core` | An isolated checkout for one piece of work, created or reused. |
| `address-threads` | `agent` | `addressThreads()` | `@amykit/core` |  |
| `announce` | `notifier` | `announce()` | `@amykit/core` |  |
| `ask-question` | `tracker` | `comment()` | `@amykit/core` |  |
| `assign-reviewer` | `code-host` | `requestReview()` | `@amykit/core` |  |
| `draft-plan` | `agent` | `ask()` | `@amykit/core` | Ask the agent for a piece of writing, in whoever asked's own words. |
| `escalate` | `tracker` | `createFollowUp()` | `@amykit/core` |  |
| `hand-off-to-qa` | `tracker` | `setStatus()` | `@amykit/core` |  |
| `implement` | `agent` | `implement()` | `@amykit/core` |  |
| `open-pull-request` | `code-host` | `openPullRequest()` | `@amykit/core` |  |
| `request-rereview` | `code-host` | `requestReview()` | `@amykit/core` |  |
| `resolve-review-thread` | `code-host` | `resolveReviewThread()` | `@amykit/core` | Close one review thread, by its id. |
| `run-errand` | `agent` | `ask()` | `@amykit/core` | Do the thing somebody asked for, in their own words. |
| `run-gate` | `gate` | `run()` | `@amykit/core` |  |
| `self-review` | `agent` | `ask()` | `@amykit/core` | A workflow-declared half-step: the work reviews itself before a person is asked to. |
| `triage` | `agent` | `triage()` | `@amykit/core` |  |
| `check-plan` | `plan-check` | `check()` | `@amykit/plugin-plan-check` | Registered by the plugin that brings the port behind it. |
| `run-command` | `commands` | `run()` | `@amykit/plugin-command` | Registered by the plugin that brings the port behind it. |

<!-- amy:end core-actions -->

## What a workflow declares

```ts
actions: {
  "triage": async (action, ctx) => { /* ... */ },
  "announce": async (action, ctx) => { /* ... */ },
  "merge": { port: "forge", method: "merge" },
}
```

One entry per action, on the workflow's runtime: the key is the name `plan()`
emits, the value is what runs it — a handler the workflow wrote, or a port and a
method the host calls with the action and its context. Declaring and
implementing are the same line, so they cannot disagree, and the host answers
before touching any work whether every one of them can run:

```
amy could not start:
  action `hand-off-to-qa` is declared with no implementation — give it a handler, or a port and a method
  action `triage`: needs the `agent` port, which nothing mounted
  action `merge`: the `forge` port has no method `merge`
```

A handler still runs an action the catalogue above names, because the
catalogue is what tells the budget which actions spend an agent and the tracker
check which ones write. A port and a method names its own port, so it may run
an action nobody catalogued — but not one the catalogue sends to a different
port.

A plan that carries a name the map does not is refused by the engine before any
of that plan's actions run, and by the testkit before it ships.

## The payload lives in the workflow

The core owns the name. The *payload* an action carries in a given workflow is
that workflow's business:

```ts
export type Effect =
  | { type: "address-threads"; threadIds: string[]; from: "automated" | "human" }
  | { type: "assign-reviewer"; host: string }
  | { type: "announce"; text: string };
```

That is what lets `plan()` stay type-checked over its own vocabulary while the
core's `Action` stays `{ type: string } & Record<string, unknown>`.

## Adding an action

Two routes, and which one is right depends on one question: **does anything
outside your package want it?**

**A plugin action.** Your plugin registers the action *and* the port that runs
it, in the same package:

```ts
registry.action("page-oncall", { port: "pager", method: "page" }, new PagerDutyPager(…));
```

Use this when the action is yours. It works immediately, nothing here has to
change, and you can publish it.

**A core action.** Adding to `CORE_ACTIONS` is a change to amy itself, and the
bar is a second consumer. An action in the core with one user is a domain the
core has learnt for nothing — which is the exact failure `L0.CORE_STAYS_IGNORANT`
exists to prevent.

So the path is: ship it in your plugin, and if a second workflow wants it, it
graduates by evidence.

## Actions do not decide anything

An action is *described* by `plan()` and *executed* by what the runtime declared
for it. The machine never performs one, and the handler never decides whether
to.

That separation is why the whole lifecycle can be walked in a test with no I/O,
and why a handler can be tested against a scripted world without a state machine
anywhere near it.

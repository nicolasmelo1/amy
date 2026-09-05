---
title: Ports
description: Named slots one plugin fills, the contracts behind them, and which are not ports at all.
group: How it works
order: 4
---

# Ports

A **port** is a named slot in a mounted host. One plugin fills it, an action
dispatches to it, and a workflow narrows it to whatever subset it needs.

```ts
registry.port("tracker", new LinearTracker(…));
```

The name is a string, and that is deliberate: the core owns the *catalogue of
actions*, and each action declares the port it needs. A port kind nobody
dispatches to is still a port — a workflow's runtime may reach one directly.

## The ports that exist

<!-- amy:generated port-kinds -->

| Port | Mounted by | Actions dispatched to it |
| :-- | :-- | :-- |
| `agent` | `@amykit/plugin-agent-relay` | `address-threads`, `draft-plan`, `implement`, `run-errand`, `triage` |
| `code-host` | `@amykit/plugin-github` | `assign-reviewer`, `open-pull-request`, `request-rereview` |
| `commands` | `@amykit/plugin-command` | `run-command` |
| `gate` | `@amykit/plugin-command-gate` | `run-gate` |
| `notes` | `@amykit/plugin-file-notes` | _reached directly_ |
| `notifier` | `@amykit/plugin-notify-fanout` | `announce` |
| `plan-check` | `@amykit/plugin-plan-check` | `check-plan` |
| `queue` | `@amykit/plugin-file-queue` | _reached directly_ |
| `store` | `@amykit/plugin-file-store` | _reached directly_ |
| `tasks` | `@amykit/plugin-file-tasks` | _reached directly_ |
| `tracker` | `@amykit/plugin-linear` | `ask-question`, `escalate`, `hand-off-to-qa` |

<!-- amy:end port-kinds -->

Two things to read out of that table:

**`agent` is filled by the relay, not by a harness.** The Claude, Codex and
Hermes plugins *contribute themselves* to a collection; `@amykit/plugin-agent-relay`
is the only thing that mounts the `agent` port. Dropping the relay from a config
leaves every agent action without a port, and the mount is refused at boot.

**A port with no shipped implementation is not a gap.** It is the slot your
plugin fills.

## The contracts

These are the interfaces `packages/core/src/ports` declares. Not all of them are
mounted as ports — see the next section.

<!-- amy:generated core-contracts -->

### `Budget`

Whether work that spends an agent may start.

Declared in `packages/core/src/ports/Budget.ts`.

| Method | What it does |
| :-- | :-- |
| `mayStart(now: Date): BudgetDecision` |  |

### `CodeHost`

The forge: a repository, a branch, a pull request and a login.

Declared in `packages/core/src/ports/CodeHost.ts`.

| Method | What it does |
| :-- | :-- |
| `findPullRequest(repo: string, branch: string): Promise<PullRequestView \| null>` |  |
| `openPullRequest(request: OpenPullRequestRequest): Promise<number>` |  |
| `requestReview(repo: string, pullRequestNumber: number, host: string): Promise<void>` |  |
| `reviewLoad(repos: readonly string[]): Promise<Record<string, number>>` | Open reviews per login, counted across every given repository. |

### `CommandRunner`

Running a child process, behind a port.

Declared in `packages/core/src/ports/CommandRunner.ts`.

| Method | What it does |
| :-- | :-- |
| `run(command: string, args: readonly string[], options?: RunOptions): Promise<CommandResult>` |  |

### `Commands`

Any command line tool, reached by a name somebody put in the config.

Declared in `packages/core/src/ports/Commands.ts`.

| Method | What it does |
| :-- | :-- |
| `run(name: string, args?: readonly string[], options?: { cwd?: string }): Promise<CommandOutcome>` |  |
| `available(): readonly string[]` | What the config allows, for a refusal that names the alternatives. |

### `EventLog`

The append-only record of everything that happened.

Declared in `packages/core/src/ports/EventLog.ts`.

| Method | What it does |
| :-- | :-- |
| `append(event: Event): void` |  |
| `read(since?: Date): Event[]` | Events at or after the given instant, oldest first. |

### `GraphQLClient`

A GraphQL endpoint, behind a port.

Declared in `packages/core/src/ports/GraphQL.ts`.

| Method | What it does |
| :-- | :-- |
| `request(query: string, variables?: Record<string, unknown>): Promise<T>` |  |

### `Harness`

One coding agent CLI, reduced to the only thing that differs between them.

Declared in `packages/core/src/ports/Harness.ts`.

| Method | What it does |
| :-- | :-- |
| `ask(prompt: string, cwd: string, context?: AskContext): Promise<HarnessReply>` |  |

### `Notifier`

How the machine reaches the operator when it needs them.

Declared in `packages/core/src/ports/Notifier.ts`.

| Method | What it does |
| :-- | :-- |
| `announce(announcement: Announcement): Promise<void>` |  |

### `Queue`



Declared in `packages/core/src/ports/Queue.ts`.

| Method | What it does |
| :-- | :-- |
| `enqueue(request: EnqueueRequest, now: Date): QueueItem` |  |
| `claim(now: Date): QueueItem \| null` | Takes the earliest item that is due, and marks it as being worked on so a second worker cannot take it too. Returns null when nothing is due, which is different from the queue being empty. |
| `complete(item: QueueItem): void` |  |
| `release(item: QueueItem): void` | Puts a claimed item back, for a worker that could not finish it. |
| `promote(workId: string, now: Date): number` | Brings every look at one piece of work that is still held back forward to now, and says how many moved. |
| `recover(olderThanMs: number, now: Date): QueueItem[]` | Returns items abandoned by a dead worker so they get picked up again. |
| `prune(retentionDays: number, now: Date): number` | Deletes finished items past their retention, so the directory stays small. |
| `ready(now: Date): QueueItem[]` |  |
| `pending(): QueueItem[]` |  |

### `StopSwitch`

The handbrake.

Declared in `packages/core/src/ports/StopSwitch.ts`.

| Method | What it does |
| :-- | :-- |
| `isRequested(): boolean` |  |
| `reason(): string \| null` |  |
| `request(reason: string): void` |  |
| `clear(): void` |  |
| `watch(onRequested: (reason: string) => void): () => void` | Calls back as soon as a stop is requested, and returns the function that stops watching. |

### `Store`

Where the record of one piece of work is kept between looks.

Declared in `packages/core/src/ports/Store.ts`.

| Method | What it does |
| :-- | :-- |
| `load(workId: string): R \| null` |  |
| `save(record: R): void` |  |
| `all(): R[]` |  |

<!-- amy:end core-contracts -->

## What is a port, and what is lent to everybody

Three of those contracts are **host services** rather than ports. Every plugin
gets them in its context, and nothing mounts them:

| Contract | Why it is not a port |
| :-- | :-- |
| `CommandRunner` | Every adapter that shells out needs it. Making it a port would mean every plugin declaring a dependency on the same thing. |
| `EventLog` | One log, opened by the host, handed to everybody. Two logs would be two budgets. |
| `StopSwitch` | **Deliberately not a plugin**: a handbrake that depends on plugins loading cannot stop a run whose plugins are what went wrong. |
| `GraphQLClient` | A transport an adapter constructs for itself, kept behind an interface so the adapter's queries can be tested without a network. |

And one contract is mounted under a different name than it is called:
**`Harness` mounts as `agent`**. The relay mounts an object that is both — the
ticket-shaped half (`triage`, `implement`, `addressThreads`) and the half with
no vocabulary in it (`ask`) — so a second workflow's own prompts end up on the
same ladder, in the same log and under the same ceiling as the first workflow's.
Neither workflow has to know the other exists.

## Narrowing a port

The core keeps its contracts domain-free, so a workflow narrows what it uses to
what it needs:

```ts
// The ticket workflow's view of the agent port
export interface Agent {
  triage(ticket: Ticket): Promise<AgentResult<TriageOutcome>>;
  implement(ticket: Ticket, retryContext?: string): Promise<AgentResult<AttemptOutcome>>;
  addressThreads(…): Promise<AgentResult<ThreadVerdict[]>>;
}

// The errand workflow's view of the same mounted object
import type { Harness } from "@amykit/core";   // just `ask`
```

Both are the same mounted object. Neither package imports the other. This is
what "the core is generic so type safety comes from the other side" means in
practice.

## Filling a port from your own plugin

```ts
export const plugin: Plugin = {
  name: "@acme/plugin-jira",
  version: "1.0.0",
  configSchema,
  register(registry, ctx) {
    registry.port("tracker", new JiraTracker(ctx.runner, ctx.config));
  },
};
```

Nothing else changes. `@amykit/plugin-linear` comes out of the profile's plugin
list, yours goes in, and every action that dispatches to `tracker` now reaches
you.

The methods you have to provide are the ones the *workflow* calls, not the ones
the core declares — a workflow narrows the port, so implementing its narrowed
interface is sufficient and is checked by the compiler at your end.

## Registering a port the core has never heard of

A plugin may add an action, and when it does it brings the port that runs it:

```ts
registry.action("check-plan", { port: "plan-check", method: "check" }, new PlanCommandCheck(…));
```

Both halves in one package, deliberately. An action nobody can execute is a
promise the machine cannot keep. If your action turns out to be general, the way
it graduates into the core is evidence — a second workflow that wants it —
rather than a guess.

See [Actions](actions.md) and [Write a plugin](../build/write-a-plugin.md).

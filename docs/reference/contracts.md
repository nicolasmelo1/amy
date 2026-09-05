---
title: Contracts
description: Every interface in the core — the ports, and the services lent to every plugin.
group: Reference
order: 4
---

# Contracts

The interfaces in `packages/core/src/ports`, with the doc comment each one
carries. Read out of the source on every build.

Not all of them are ports. `CommandRunner`, `EventLog`, `StopSwitch` and
`GraphQLClient` are lent to plugins rather than mounted, and `Harness` is
mounted under the name `agent` — [Ports](../concepts/ports.md#what-is-a-port-and-what-is-lent-to-everybody)
explains why for each.

## The mounted port kinds

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

## The action catalogue

<!-- amy:generated core-actions -->

| Action | Port | Method | Shipped by | What it is |
| :-- | :-- | :-- | :-- | :-- |
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
| `run-errand` | `agent` | `ask()` | `@amykit/core` | Do the thing somebody asked for, in their own words. |
| `run-gate` | `gate` | `run()` | `@amykit/core` |  |
| `triage` | `agent` | `triage()` | `@amykit/core` |  |
| `check-plan` | `plan-check` | `check()` | `@amykit/plugin-plan-check` | Registered by the plugin that brings the port behind it. |
| `run-command` | `commands` | `run()` | `@amykit/plugin-command` | Registered by the plugin that brings the port behind it. |

<!-- amy:end core-actions -->

## What a decision can be

<!-- amy:generated plan-kinds -->

| Kind | Fields | What it means |
| :-- | :-- | :-- |
| `act` | `kind: "act"`<br>`effects: Action[]`<br>`why: string` | Do the work, stay in this state, and look again straight away. The next look sees whatever the actions recorded, which is how a pure decision function drives work that takes minutes or hours. |
| `advance` | `kind: "advance"`<br>`to: string`<br>`effects: Action[]`<br>`why: string` |  |
| `wait` | `kind: "wait"`<br>`retryAfterMs: number`<br>`why: string`<br>`effects: Action[]` | Nothing to do until the outside world moves. May still carry actions, so a workflow can say why it is stuck without leaving the state. |
| `settled` | `kind: "settled"`<br>`why: string` | Terminal, do not queue anything else. |

<!-- amy:end plan-kinds -->

## The interfaces

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
| `reviewsRequestedOf(login: string, repos: readonly string[]): Promise<ReviewRequest[]>` | The open pull requests waiting on one login's review, in these repositories and no others. |

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

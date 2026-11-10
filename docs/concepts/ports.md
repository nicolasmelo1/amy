---
title: Ports
description: Named slots one plugin fills, the contracts behind them, the checkouts the host lends, and what is not a port at all.
group: How it works
order: 5
---

# Ports

A **port** is a named slot in a mounted host. One plugin fills it, an action
dispatches to it, and a workflow names the ones it uses in `needs`.

```ts
import { definePlugin, type Tracker } from "@amykit/core";

declare function jira(site: string): Tracker;

export const plugin = definePlugin({
  name: "@acme/plugin-jira",
  configSchema: { site: { type: "string", description: "the Jira site", required: true } },
  register(registry, ctx) {
    registry.port("tracker", jira(ctx.config.site));
  },
});
```

The name is a string on purpose: the core owns the catalogue of actions, and
each action says which port it needs. A port nothing dispatches to is still a
port, and a workflow's actions may reach it directly.

## The ports that exist

<!-- amy:generated port-kinds -->

| Port | Mounted by | Actions dispatched to it |
| :-- | :-- | :-- |
| `agent` | `@amykit/plugin-agent-relay` | `address-threads`, `discuss`, `draft-plan`, `implement`, `run-errand`, `self-review`, `triage` |
| `brief` | `@amykit/plugin-file-brief-store` | _reached directly_ |
| `code-host` | `@amykit/plugin-github` | `assign-reviewer`, `open-pull-request`, `request-rereview`, `resolve-review-thread` |
| `commands` | `@amykit/plugin-command` | `run-command` |
| `conversation` | `@amykit/plugin-slack`<br>`@amykit/plugin-telegram`<br>`@amykit/plugin-terminal-conversation` | _reached directly_ |
| `feature` | `@amykit/plugin-linear` | _reached directly_ |
| `gate` | `@amykit/plugin-command-gate` | `run-gate` |
| `notes` | `@amykit/plugin-file-notes` | _reached directly_ |
| `notifier` | `@amykit/plugin-notify-fanout` | `announce`, `hand-over` |
| `notify` | `@amykit/plugin-notify-hermes` | _reached directly_ |
| `plan-check` | `@amykit/plugin-plan-check` | `check-plan` |
| `queue` | `@amykit/plugin-file-queue` | _reached directly_ |
| `store` | `@amykit/plugin-file-store` | _reached directly_ |
| `tasks` | `@amykit/plugin-file-tasks` | _reached directly_ |
| `tracker` | `@amykit/plugin-linear`<br>`@amykit/plugin-next-steps` | `ask-question`, `escalate`, `hand-off-to-qa` |
| `workspace` | `@amykit/plugin-file-worktree` | _reached directly_ |
| `worktree` | `@amykit/plugin-file-worktree` | `acquire-worktree` |

<!-- amy:end port-kinds -->

**`agent` is filled by the relay, not by a harness.** The Claude, Codex and
Hermes plugins contribute themselves to the `harness` collection;
`@amykit/plugin-agent-relay` is what mounts the `agent` port. A config without
the relay leaves every agent action without a port, and the mount is refused at
boot.

**A port with no shipped implementation is not a gap.** It is the slot your
plugin fills. Swap `@amykit/plugin-linear` for yours in the profile's plugin
list, and every action that dispatches to `tracker` reaches you.

## The contracts

These are the interfaces `packages/core/src/ports` declares. The ports belong
to the core so a plugin never imports a workflow
([the ports belong to the core](../design/the-ports-belong-to-the-core.md)).
Not every one is mounted as a port; see the next sections.

A gap in a contract is closed in the contract, so no workflow writes its own
adapter beside the plugin that owns the service
([the forge is asked, not run beside](../design/the-forge-is-asked-not-run-beside.md)).
That is how these grew:

- A `Ticket` carries its `body`, and `comments` returns what a person answered
  ([the ticket body reaches the agent](../design/the-ticket-body-reaches-the-agent.md),
  [an answer reaches the agent](../design/an-answer-reaches-the-agent.md)).
- A `ReviewThread` carries its replies, and `resolveReviewThread` closes it
  ([a reply inside a thread reaches the agent](../design/a-reply-inside-a-thread-reaches-the-agent.md),
  [the threads close when they are answered](../design/the-threads-close-when-they-are-answered.md)).
- `pullRequestAncestry` tells a stacked pull request where its parent went
  ([a stack knows its parent](../design/a-stack-knows-its-parent.md)).
- A brief lists the work it `explains`, and a ticket names it by its feature's
  identifier in `briefId`
  ([a brief reaches every ticket it explains](../design/a-brief-reaches-every-ticket-it-explains.md),
  [a brief is named the way its feature is](../design/a-brief-is-named-the-way-its-feature-is.md)).
- `BaseSource` lets grooming read, search and date the base branch at one
  `revision`
  ([grooming reads the code it is about](../design/grooming-reads-the-code-it-is-about.md),
  [a snapshot is a commit](../design/a-snapshot-is-a-commit.md)).

<!-- amy:generated core-contracts -->

### `Agent`

The coding agent, and the only probabilistic thing in the system.

Declared in `packages/core/src/ports/Agent.ts`.

| Method | What it does |
| :-- | :-- |
| `ask(prompt: string, cwd: string, context?: AskContext): Promise<HarnessReply>` |  |

### `BaseSource`

The narrow source capability grooming receives.

Declared in `packages/core/src/ports/BaseSource.ts`.

| Method | What it does |
| :-- | :-- |
| `snapshot(repo: string): Promise<BaseSourceSnapshot>` |  |

### `BaseSourceSnapshot`

A read-only view of one repository at one commit of its base branch.

Declared in `packages/core/src/ports/BaseSource.ts`.

| Method | What it does |
| :-- | :-- |
| `read(path: string): Promise<string \| null>` | Reads a tracked file as it exists at `revision`. |
| `search(text: string, options?: SearchOptions): Promise<SearchResult>` | Where a text appears at `revision`. Literal by default. |
| `history(text: string, options?: HistoryOptions): Promise<HistoryResult>` | Commits up to `revision` that added or removed occurrences of a text. |

### `BriefStore`

The mounted persistence port behind every brief read and write.

Declared in `packages/core/src/ports/Brief.ts`.

| Method | What it does |
| :-- | :-- |
| `get(id: BriefId): Promise<BriefRecord \| null>` | The current brief by id, or null when no such brief exists. |
| `write(input: { id: BriefId; sections: { name: string; body: string }[]; /** The work ids this brief explains, in the caller's own vocabulary. */ explains: string[]; at: string; }): Promise<BriefRecord>` | Creates a brief, or replaces every section of an existing one. The id is the caller's to choose and stable for the brief's life; an append is a separate operation, so a revision never loses a question. |
| `appendQuestion(input: { id: BriefId; question: BriefQuestion; at: string }): Promise<BriefRecord>` | Appends a question, with its work id and time. There is no operation that appends an answer: a question is decided by the workflow that owns the brief, and that decision is a revision, not an append. |
| `retired(explainsAreTerminal: (workId: string) => boolean, retentionCutoffMs: number, now: Date): Promise<BriefId[]>` | Lists brief ids whose every work id is terminal and older than the store's retention policy, for the retirement sweep. The caller decides what terminal means in its own vocabulary; this only reports what it was told at write time and cannot invent a work state it never knew. |
| `remove(id: BriefId): Promise<void>` | Removes a brief by id. The event log remains the durable history. |

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
| `pullRequestAncestry(repo: string, number: number): Promise<PullRequestAncestry \| null>` | The forge facts a stacked child needs to choose its base. |
| `findPullRequestMentioning(repo: string, id: string): Promise<PullRequestView \| null>` | The pull request whose title names this id as a whole word, open or merged, in one repository. |
| `openPullRequest(request: OpenPullRequestRequest): Promise<number>` | Throws a `CodeHostRefusal` when the host answers that it will not; any other throw is a failure. |
| `requestReview(repo: string, pullRequestNumber: number, host: string): Promise<void>` |  |
| `resolveReviewThread(threadId: string): Promise<void>` | Closes one review thread, by its own id, in one act. |
| `unresolveReviewThread(threadId: string): Promise<void>` | Puts a closed thread back, for a fix that was reverted. |
| `reviewLoad(repos: readonly string[]): Promise<Record<string, number>>` | Open reviews per login, counted across every given repository. |
| `reviewsRequestedOf(login: string, repos: readonly string[]): Promise<ReviewRequest[]>` | The open pull requests waiting on one login's review, in these repositories and no others. |
| `changesRequestedOf(login: string, repos: readonly string[]): Promise<ReviewRequest[]>` | The open pull requests one login's review left changes requested on, in these repositories and no others. |
| `authoredWithChangesRequested(login: string, repos: readonly string[]): Promise<ReviewRequest[]>` | The open pull requests one login authored that somebody asked to change, in these repositories and no others. |
| `pullRequest(repo: string, number: number): Promise<PullRequestView \| null>` | One pull request by its number, merged or not. |
| `merge(repo: string, number: number, method: "merge" \| "squash" \| "rebase"): Promise<void>` | Merges it, by the method the caller named. |
| `submitReview(repo: string, number: number, review: { state: ReviewState; body: string }): Promise<void>` | Submits a review of it, in the state the caller decided on. |
| `createIssue(repo: string, issue: { title: string; body: string }): Promise<number>` | Files an issue in the repository, as the forge writes one. |
| `commitStatuses(repo: string, sha: string): Promise< { context: string; state: "passing" \| "failing" \| "running" }[] >` | The statuses the forge recorded on one commit, as a list. |

### `CommandRunner`

Running a child process, behind a port.

Declared in `packages/core/src/ports/CommandRunner.ts`.

| Method | What it does |
| :-- | :-- |
| `run(command: string, args: readonly string[], options?: RunOptions): Promise<CommandResult>` |  |
| `spawn(command: string, args: readonly string[], options?: Pick<RunOptions, "cwd" \| "env">): ChildProcessWithoutNullStreams` | So protocol children stop through the same handbrake as ordinary commands. |

### `Commands`

Any command line tool, reached by a name somebody put in the config.

Declared in `packages/core/src/ports/Commands.ts`.

| Method | What it does |
| :-- | :-- |
| `run(name: string, args?: readonly string[], options?: { cwd?: string }): Promise<CommandOutcome>` |  |
| `available(): readonly string[]` | What the config allows, for a refusal that names the alternatives. |

### `Conversation`

Where an operator and one piece of work talk without using the tracker.

Declared in `packages/core/src/ports/Conversation.ts`.

| Method | What it does |
| :-- | :-- |
| `chat(): Promise<ChatMessage[]>` | The messages that reached no work, filed and not yet settled, oldest first. Present only on adapters that answer in the chat; the daemon reads it all the time, and one arriving mid-turn waits for the next turn. |
| `settle(id: string): Promise<void>` | The message is answered: it is not handed out again. |
| `say(place: string, text: string): Promise<string>` | Says something in a chat place, and answers the message's id. |
| `revise(place: string, id: string, text: string): Promise<void>` | Replaces what a said message reads; only where `edit` is declared. |
| `open(workId: string, title: string): Promise<ThreadRef>` | Opens the work's remembered thread, creating it only on first use. |
| `post(thread: ThreadRef, message: { text: string; files?: string[]; ask?: Ask }): Promise<string>` |  |
| `replies(thread: ThreadRef, since: string): Promise<Reply[]>` | Replies after `since`, oldest first. Files are readable local paths. |

### `EventLog`

The append-only record of everything that happened.

Declared in `packages/core/src/ports/EventLog.ts`.

| Method | What it does |
| :-- | :-- |
| `append(event: Event): void` |  |
| `read(since?: Date): Event[]` | Events at or after the given instant, oldest first. |
| `watch(since: Date, onEvent: (event: Event) => void): () => void` | Every event at or after `since`, oldest first, then every event any process appends afterwards, until the returned function is called. |

### `FeatureTracker`

Read-only feature discovery supplied by a tracker provider.

Declared in `packages/core/src/ports/Ticketing.ts`.

| Method | What it does |
| :-- | :-- |
| `features(): Promise<Feature[]>` |  |
| `getFeature(id: string): Promise<Feature \| null>` |  |

### `FeatureWorkTracker`

Tracker mutations a grooming workflow needs. They are feature-scoped rather than ticket-workflow operations so a provider can implement them without importing or knowing about ticket-to-qa.

Declared in `packages/core/src/ports/Ticketing.ts`.

| Method | What it does |
| :-- | :-- |
| `groomedWork(featureId: string, groomedBy: string): Promise<GroomedWork[]>` |  |
| `createGroomedWork(input: Omit<GroomedWork, "id" \| "retired">): Promise<GroomedWork>` |  |
| `updateGroomedWork(id: string, input: Pick<GroomedWork, "title" \| "body">): Promise<GroomedWork>` |  |
| `retireGroomedWork(id: string): Promise<void>` |  |

### `Gate`

The gate: the check that decides whether an implementation holds, before anything is published for a person to read.

Declared in `packages/core/src/ports/Gate.ts`.

| Method | What it does |
| :-- | :-- |
| `run(workplace: Workplace): Promise<AttemptOutcome>` | Runs the gate in the work's own tree, and says what happened. |

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
| `reprioritize(workId: string, priority: number \| undefined): number` | Sets the urgency of every look at one piece of work still waiting, and says how many changed. |
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

### `TrackerReads`

Reads a tracker answers, and writes only the workflow's declared surface.

Declared in `packages/core/src/ports/Ticketing.ts`.

| Method | What it does |
| :-- | :-- |
| `inProgress(): Promise<Ticket[]>` | Tickets assigned to the operator that sit in the working status. |
| `get(ticketId: string): Promise<Ticket \| null>` | One ticket by id, including after it has left the working status. |
| `comments(ticketId: string, since?: string): Promise<Comment[]>` | The conversation on a ticket, oldest first, up to now. |
| `hasReplyAfter(ticketId: string, since: string): Promise<boolean>` | Whether anybody other than the machine has replied since the given instant. |

### `TrackerWrites`

The writes a tracker answers — deliberately its own surface rather than half of one contract.

Declared in `packages/core/src/ports/Ticketing.ts`.

| Method | What it does |
| :-- | :-- |
| `comment(ticketId: string, body: string): Promise<void>` |  |
| `setStatus(ticketId: string, statusName: string): Promise<void>` |  |
| `assign(ticketId: string, trackerIdentity: string): Promise<void>` |  |
| `createFollowUp(request: FollowUpRequest): Promise<string>` |  |

### `Worktree`

Checkout isolation for one install.

Declared in `packages/core/src/ports/Worktree.ts`.

| Method | What it does |
| :-- | :-- |
| `acquire(workId: string, repo: string): Promise<string>` | The path of this item's own tree, creating it when it does not exist and reusing it when it does. A new tree is cut from the default branch; the item's branch is prepared there by `Git`, which owns branch vocabulary. |
| `pathFor(workId: string, repo: string): string` | The path this item's tree would live at, without touching the disk. |
| `states(): Promise<WorktreeInfo[]>` | Every tree this machine holds, and what state each is in. |
| `release(workId: string, repo: string, options?: { force?: boolean }): Promise<boolean>` | Removes a tree that has become safe to remove, and says whether it did. |
| `prune(now: Date): Promise<string[]>` | Removes every tree the retention predicate allows, and leaves every other one exactly as it was. |

<!-- amy:end core-contracts -->

## Checkouts

`ctx.checkouts()` is how a plugin or a workflow gets a repository's checkout.
It returns a `Checkouts`: a `git` to work in and the `layout` behind it, for
the question `Git` does not answer, which branch a pull request opens against
(`baseBranchFor(layout, repo)`). Every workflow piece gets the same object as
`checkouts`.

```ts
import { baseBranchFor, type PluginContext } from "@amykit/core";

declare const ctx: PluginContext;

const { git, layout } = ctx.checkouts();
const tree = await git.acquire("acme/app", "TBO-1");
const base = baseBranchFor(layout, "acme/app");
```

It reads the `workspace` port for where checkouts live (`workspaceRoot`, and a
path per repository), the calling plugin's own `defaultBranch` and
`baseBranch`, and the `worktree` port, read each time a path is asked for, so a
worktree plugin listed later is still the one used. The workspace is looked up
on first use: when nothing mounted one, the read is refused, naming who asked
and that `@amykit/plugin-file-worktree` provides it. A plugin that takes the
branch settings spreads `BRANCH_SETTINGS` into its schema. Nothing outside the
core constructs a `Git`.

Why: [the host lends the checkout](../design/the-host-lends-the-checkout.md),
[a workspace is a capability](../design/a-workspace-is-a-capability.md),
[a base branch per repository](../design/a-base-branch-per-repository.md) and
[a checkout root per repository](../design/a-checkout-root-per-repository.md).

## What is a port, and what is lent to everybody

Some contracts are **host services**, not ports. Nothing mounts them:

| Contract | Why it is not a port |
| :-- | :-- |
| `CommandRunner` | Every adapter that shells out needs it, as `ctx.runner`. A port would make every plugin declare the same dependency. |
| `EventLog` | One log, opened by the host and handed to everybody as `ctx.log`. A second log would mean a second budget. |
| `StopSwitch` | **Deliberately not a plugin**: a handbrake that depends on plugins loading cannot stop a run whose plugins are what went wrong. |
| `GraphQLClient` | A transport an adapter builds for itself, behind an interface so its queries are tested without a network. |

**`Harness` mounts as `agent`.** The relay offers `ask` and nothing else, so
every workflow's prompts go through the same ladder, the same log and the same
ceiling, keyed by the step each names in its context. No agent touches git:
when work is committed and pushed is the workflow's decision
([an agent only answers](../design/an-agent-only-answers.md)).

## Narrowing a port

The core keeps its contracts domain-free, so a workflow narrows what it uses
to what it needs, at its own boundary:

```ts
import type { Git } from "@amykit/core";

/** The ticket workflow's view of git: only what it drives. */
export type TicketGit = Pick<Git, "pathFor" | "acquire" | "prepareBranch" | "commitAndPush">;
```

A port you write needs the methods the workflows you run call, and the
compiler checks that at your end.

## A port the core has never heard of

A plugin may add an action, and then it brings the port that runs it:

```ts
import { acceptsAction, definePlugin, type Action, type ActionContext } from "@amykit/core";

const pager = {
  page: acceptsAction(async (action: Action, _context: ActionContext) => ({ paged: String(action.who) })),
};

export const plugin = definePlugin({
  name: "@acme/plugin-pager",
  configSchema: {},
  register(registry) {
    registry.action("page-oncall", { port: "pager", method: "page" }, pager);
  },
});
```

Both halves live in one package. If the action turns out to be general, it
graduates into the core when a second workflow wants it. See
[Actions](actions.md) and [Write a plugin](../guides/write-a-plugin.md).

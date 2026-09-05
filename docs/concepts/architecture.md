---
title: Architecture
description: What owns what, the one rule everything else follows from, and where the types live.
group: How it works
order: 1
---

# Architecture

## The one rule

**The core knows no workflow and no plugin.**

`packages/core` owns the catalogue of actions, the port contracts, the generic
work record, the plan and the registry. It does not know what a ticket is, what
a reviewer is, or what a pull request is. A state is a string to it and an
action is a name.

Everything else follows from that, and it is one import away from being lost, so
it is a check that fails the build:

```
✗ critical L0.CORE_STAYS_IGNORANT
    nothing under packages/core/src imports an @amy/workflow-* or @amy/plugin-*
```

Its mutation fixture is a core file that imports a workflow's type, and
`sf verify` confirms the rule still catches it. Before it was a check, it rested
on nobody making a single wrong import.

## The layers

```text
@amy/core
  actions:  triage, implement, run-gate, draft-plan, open-pull-request,
            address-threads, assign-reviewer, request-rereview, escalate,
            hand-off-to-qa, announce    each declares the port it needs
  ports:    Queue, Store, Notifier, EventLog, Budget, StopSwitch,
            CodeHost, Harness           none of them names a domain
  contract: Workflow + WorkflowRuntime  what an engine drives, generically
      ▲                                          ▲
      │ composes actions                         │ implements ports
      │                                          │
@amy/workflow-ticket-to-qa              @amy/plugin-linear       tracker
  the sixteen states, a pure plan(),    @amy/plugin-github       code-host
  its typed port contracts, and the     @amy/plugin-claude       harness
  runtime that runs its actions         @amy/plugin-agent-relay  agent
      │                                 @amy/plugin-command-gate gate
@amy/workflow-note-to-plan              @amy/plugin-plan-check   plan-check
  five states and one refusal, over     @amy/plugin-file-notes   notes
  work that never was a ticket          @amy/plugin-notify-*     notifier
      │                                 @amy/plugin-file-queue   queue
      │ each contributes a runtime      @amy/plugin-file-store   store
      ▼
@amy/plugin-serial-engine
  a queue, a budget, a retry count and a stop switch — and no idea what a
  ticket or a plan is
```

The dependency direction is the whole point:

- **`core` depends on no other package here.**
- **A workflow depends only on `core`.**
- **An adapter depends on `core` for infrastructure, and on a workflow only for
  the types that workflow declares** — which is why the GitHub plugin depends on
  neither workflow: `CodeHost` is the core's, and one mounted adapter serves all
  of them.
- **Nothing depends on the CLI.**

## The workspace

<!-- amy:generated workspace-layout -->

```text
packages/
├── agent-kit            What every agent does the same way: the prompts, the git dance, and the JSON.
├── cli                  The amy command line: one install per machine, reached from any harness.
├── core                 Plugin contracts, the action catalogue, the registry and the loader. Knows no domain.
├── model-specs          What each model costs per token, vendored and versioned.
├── test-fixtures        Shared test builders and scripted doubles. Not published.
├── workflow-errand      Something said in passing becomes work: capture it, do it, say what happened.
├── workflow-note-to-plan The note-to-plan workflow: friction becomes a plan in the repository it is about.
└── workflow-ticket-to-qa The ticket-to-QA workflow: its states, its typed port contracts, and a pure plan().

plugins/
├── agent-relay          One agent made of several: swaps harness on a quota, escalates model on a failure.
├── claude               The claude CLI as the agent, with git on the side.
├── codex                The codex CLI as the agent, over its JSONL event stream.
├── command              Any command line tool, reached by a name the config allows.
├── command-gate         A gate that runs the target repository's own commands.
├── file-log             The event log kept as one JSON Lines file per day.
├── file-notes           Friction as a directory of notes: written by hand, by a hook, or by a tick that failed.
├── file-queue           A queue kept as one file per item, claimed by rename.
├── file-store           Work records kept as one file per item.
├── file-tasks           Tasks as a directory of files: written by `amy btw`, by an editor, or by a hook.
├── github               GitHub as the code host, through the gh CLI.
├── hermes-agent         Hermes as the agent, over its one-shot mode and usage report.
├── linear               Linear as the tracker, over its GraphQL API.
├── notify-fanout        Sends one announcement down every configured channel, and keeps going when one is down.
├── notify-hermes        Announcements over Hermes, which already owns the messaging credentials.
├── notify-inbox         Announcements as a file on disk plus a desktop notification.
├── plan-check           The quality bar for a drafted plan: the repository's own check, run in its checkout.
└── serial-engine        Advances one work item by one move per tick.
```

<!-- amy:end workspace-layout -->

A plugin's directory drops the prefix its package name keeps: `plugins/github`
publishes as `@amy/plugin-github`. The folder says where it lives, the package
name says what it is, and only the second one is a promise to anybody outside
this repository.

<!-- amy:generated workspace-dependencies -->

| Package | Kind | Depends on, in this workspace |
| :-- | :-- | :-- |
| `@amy/agent-kit` | library | `@amy/core`, `@amy/workflow-ticket-to-qa` |
| `@amy/cli` | cli | `@amy/core`, `@amy/model-specs`, `@amy/plugin-file-log`, `@amy/plugin-file-notes`, `@amy/plugin-file-queue`, `@amy/plugin-file-store`, `@amy/plugin-file-tasks`, `@amy/plugin-notify-hermes`, `@amy/workflow-ticket-to-qa` |
| `@amy/core` | library | _nothing_ |
| `@amy/model-specs` | library | `@amy/core` |
| `@amy/test-fixtures` | library | `@amy/core`, `@amy/workflow-ticket-to-qa` |
| `@amy/workflow-errand` | workflow | `@amy/core` |
| `@amy/workflow-note-to-plan` | workflow | `@amy/core` |
| `@amy/workflow-ticket-to-qa` | workflow | `@amy/core` |
| `@amy/plugin-agent-relay` | plugin | `@amy/agent-kit`, `@amy/core`, `@amy/workflow-ticket-to-qa` |
| `@amy/plugin-claude` | plugin | `@amy/agent-kit`, `@amy/core`, `@amy/model-specs` |
| `@amy/plugin-codex` | plugin | `@amy/agent-kit`, `@amy/core`, `@amy/model-specs` |
| `@amy/plugin-command` | plugin | `@amy/core` |
| `@amy/plugin-command-gate` | plugin | `@amy/core`, `@amy/workflow-ticket-to-qa` |
| `@amy/plugin-file-log` | library | `@amy/core` |
| `@amy/plugin-file-notes` | plugin | `@amy/core`, `@amy/plugin-notify-fanout` |
| `@amy/plugin-file-queue` | plugin | `@amy/core` |
| `@amy/plugin-file-store` | plugin | `@amy/core` |
| `@amy/plugin-file-tasks` | plugin | `@amy/core` |
| `@amy/plugin-github` | plugin | `@amy/core` |
| `@amy/plugin-hermes-agent` | plugin | `@amy/agent-kit`, `@amy/core`, `@amy/model-specs` |
| `@amy/plugin-linear` | plugin | `@amy/core`, `@amy/plugin-notify-fanout`, `@amy/workflow-ticket-to-qa` |
| `@amy/plugin-notify-fanout` | plugin | `@amy/core` |
| `@amy/plugin-notify-hermes` | plugin | `@amy/core`, `@amy/plugin-notify-fanout` |
| `@amy/plugin-notify-inbox` | plugin | `@amy/core`, `@amy/plugin-notify-fanout` |
| `@amy/plugin-plan-check` | plugin | `@amy/core`, `@amy/workflow-note-to-plan` |
| `@amy/plugin-serial-engine` | plugin | `@amy/core`, `@amy/workflow-ticket-to-qa` |

<!-- amy:end workspace-dependencies -->

## A workflow is only the order

**A workflow does not define actions.** It composes the ones the core ships. A
second workflow that needs `implement` reuses that one rather than dragging a
whole domain along with it. A genuinely new action goes into the core.

That sounds like a small constraint and it is the reason a third workflow costs
a package rather than a fork. See [Actions](actions.md).

## The engine drives a workflow it does not know

The engine asks the workflow what to do next, asks the *runtime the workflow
contributed* to do it, and holds the queue, the attempt counts, the budget and
the handbrake in between. Every noun in the engine is one of those; a ticket, a
pull request and a reviewer appear nowhere in it.

So a second workflow over a different domain costs a `plan()` and a runtime, not
a fork of the engine. Building the second one found a real defect in that seam —
every runtime was folding the plan into the record twice, which counted every
retry as two. That is what a real second user is for.

## The logic is code, the reach is data

`plan()` is a pure function, so a predicate like "the bot reviewed this head and
no thread is outstanding" is written directly instead of encoded in some
condition language.

What is declared as *data* is the workflow's **reach**: `usesActions` and
`usesObservers`. That is what lets the host answer, before touching anything,
whether every action the workflow can emit has something that runs it:

```ts
unmetNeeds(mounted, workflow)   // [] or the names that would fail
```

An action name that nothing handles is a boot-time error, not a surprise halfway
through somebody's ticket.

## Where the types live

The core is generic on purpose, so type safety comes from the other side. A
workflow package declares and exports its own vocabulary — `Ticket`, `Roster`,
`Note`, its own record — and narrows the ports it uses to what it needs of them.

Two workflows share one mounted `agent` port and type it differently: one as an
`Agent` with `triage` and `implement`, the other as a `Harness` with nothing in
it but `ask`. Neither has to know the other exists.

The cast between a typed record and the core's generic one lives at **one
boundary per workflow**, in its `Workflow` object, rather than being spread
around.

What is genuinely domain-free lives in the core: `CodeHost` and the pull request
it returns name a repository, a branch and a login; `Harness` is a prompt, a
directory and an account of what the answer cost.

## Nothing reaches the world except through two ports

Every adapter goes through `CommandRunner` or `GraphQLClient`, which is why
every one of them is tested against a scripted answer instead of the real `gh`,
`claude`, `git` or API — and why the list of places to audit is two files long.

---
title: Architecture
description: What owns what, the one rule everything else follows from, and where the types live.
group: How it works
order: 2
---

# Architecture

## The one rule

**The core knows no workflow and no plugin.**

`packages/core` owns the catalogue of actions, the port contracts, the generic
work record, the plan, the registry and the mount. It does not know what a
ticket, a reviewer or a pull request is. A state is a string to it and an
action is a name.

One import would break that, so it is a check that fails the build:

```text
✗ critical L0.CORE_STAYS_IGNORANT
    nothing under packages/core/src imports an @amykit/workflow-* or @amykit/plugin-*
```

Its mutation fixture is a core file that imports a workflow's type, and
`sf verify` confirms the rule still catches it.

## The layers

```text
@amykit/core
  the action catalogue      each action names the port it needs
  the port contracts        Tracker, CodeHost, Harness, Queue, Store, ...; none names a domain
  defineWorkflow, mount     what a workflow declares, and what the host assembles
      ▲                                       ▲
      │ declares a workflow                   │ fills a port, contributes
      │                                       │
workflows                                plugins
  workflow.mmd, decide, actions            @amykit/plugin-linear       tracker
  e.g. examples/workflow-ticket-to-qa      @amykit/plugin-github       code-host
       examples/workflow-errand            @amykit/plugin-agent-relay  agent
                                           @amykit/plugin-file-queue   queue
      │                                       │
      └──────────── mounted together ─────────┘
                          ▼
@amykit/plugin-serial-engine
  a queue, a budget, attempt counts and a stop switch, and no idea what a ticket is
```

Which way the dependencies point is what keeps it working:

- **`core` depends on no other package here.**
- **A workflow depends on `core`**, and otherwise only on a workflow it calls
  or a plugin it mounts itself through `extend`.
- **A plugin depends on `core`.** The GitHub plugin depends on no workflow:
  `CodeHost` is the core's, and one mounted adapter serves every workflow.
- **Nothing depends on the CLI.**

## The workspace

<!-- amy:generated workspace-layout -->

```text
packages/
├── agent-kit            What every agent does the same way: the ladders, the handoffs, and steps built on ask that never touch git.
├── cli                  The amy command line: one install per machine, reached from any harness.
├── core                 Plugin contracts, the action catalogue, the registry and the loader. Knows no domain.
├── model-specs          What each model costs per token, vendored and versioned.
├── services             amy's own domains: every operation declared once, with its documentation, and the OpenAPI document every door is read from.
├── test-fixtures        Shared test builders and scripted doubles. Not published.
├── ui                   A view is data: a closed vocabulary of primitives, JSX without React, diff and patch, a text renderer, and the closed frame every renderer is measured against.
├── ui-conformance       The frame's conformance script: drives a renderer by keys, by a remapped keymap and by the mouse, and holds what it laid out to the frame, to the other renderers and to the approved golden.
├── workflow-setup       Onboarding as an amy workflow: amy setup walks a fresh machine through harness, workflow and channels, one ask at a time.
└── workflow-testkit     The tests every workflow needs and nobody writes, driven against a world its author supplies.

plugins/
├── agent-browser        Drives a web page through agent-browser: open, snapshot, act on refs, diff, and a UI check that settles on structure, then pixels, then an agent.
├── agent-desktop        Drives a desktop app through agent-desktop: snapshot its accessibility tree and act on its refs.
├── agent-relay          One agent made of several: swaps harness on a quota, escalates model on a failure.
├── claude               The claude CLI as the agent, over its JSON envelope.
├── codex                The codex CLI as the agent, over its JSONL event stream.
├── command              Any command line tool, reached by a name the config allows.
├── command-gate         A gate that runs the target repository's own commands.
├── concurrent-engine    Advances one work item per tick, moving every lane of a fork at once.
├── file-brief-store     Briefs kept as one file per item.
├── file-log             The event log kept as one JSON Lines file per day.
├── file-notes           Friction as a directory of notes: written by hand, by a hook, or by a tick that failed.
├── file-queue           A queue kept as one file per item, claimed by rename.
├── file-store           Work records kept as one file per item.
├── file-tasks           Tasks as a directory of files: written by `amy btw`, by an editor, or by a hook.
├── file-worktree        One isolated checkout per piece of work, created or reused, pruned by retention.
├── github               GitHub as the code host, through the gh CLI.
├── hermes-agent         Hermes as the agent, over its one-shot mode and usage report.
├── linear               Linear as the tracker, over its GraphQL API.
├── next-steps           A next-steps table as the tracker: a row is a work item, its plan the body, read from the base branch.
├── notify-fanout        Posts announcements to a mounted conversation, or fans them out through configured channels when no conversation is mounted.
├── notify-hermes        Announcements over Hermes, which already owns the messaging credentials.
├── notify-inbox         Announcements as a file on disk plus a desktop notification.
├── plan-check           The quality bar for a drafted plan: the repository's own check, run in its checkout.
├── prove                Proves a phase against the real system: one workflow walks the scenario each brief settled, through the operations the mounted plugins offer.
├── serial-engine        Advances one work item by one move per tick.
├── slack                A Slack thread per piece of work, over the Web API, as the conversation port.
├── telegram             A topic per piece of work in the operator's private chat with a Telegram bot, as the conversation port.
├── terminal             Drives an interactive terminal program through terminal-use: run it, type, press keys, wait for text and read the screen.
├── terminal-conversation The person's terminal as an amy conversation: asks post to stdout, and answers come back as a line or a number.
└── ui-stub              The stub renderers that draw exactly the frame: one in pixels, one in cells. What the conformance script is proven against before a real window exists.

examples/
├── workflow-errand      Something said in passing becomes work: capture it, do it, say what happened.
├── workflow-feature-grooming Feature grooming against read-only base-branch source snapshots.
├── workflow-note-to-plan The note-to-plan workflow: friction becomes a plan in the repository it is about.
├── workflow-pull-request A workflow other workflows call: open a pull request for a branch, through whichever code host is mounted.
└── workflow-ticket-to-qa The ticket-to-QA workflow: its states, its typed port contracts, and a pure plan().
```

<!-- amy:end workspace-layout -->

A plugin's directory drops the prefix its package name keeps: `plugins/github`
publishes as `@amykit/plugin-github`. Only the package name is a promise to
anybody outside this repository.

<!-- amy:generated workspace-dependencies -->

| Package | Kind | Depends on, in this workspace |
| :-- | :-- | :-- |
| `@amykit/agent-kit` | library | `@amykit/core` |
| `@amykit/cli` | cli | `@amykit/agent-kit`, `@amykit/core`, `@amykit/model-specs`, `@amykit/plugin-file-log`, `@amykit/plugin-file-notes`, `@amykit/plugin-file-queue`, `@amykit/plugin-file-store`, `@amykit/plugin-file-tasks`, `@amykit/plugin-notify-fanout`, `@amykit/plugin-serial-engine`, `@amykit/plugin-terminal-conversation`, `@amykit/services`, `@amykit/ui`, `@amykit/workflow-setup` |
| `@amykit/core` | library | _nothing_ |
| `@amykit/model-specs` | library | `@amykit/core` |
| `@amykit/services` | library | `@amykit/core` |
| `@amykit/test-fixtures` | library | `@amykit/core`, `@amykit/workflow-ticket-to-qa` |
| `@amykit/ui` | library | _nothing_ |
| `@amykit/ui-conformance` | library | `@amykit/ui` |
| `@amykit/workflow-setup` | workflow | `@amykit/core` |
| `@amykit/workflow-testkit` | library | `@amykit/core` |
| `@amykit/plugin-agent-browser` | plugin | `@amykit/core` |
| `@amykit/plugin-agent-desktop` | plugin | `@amykit/core` |
| `@amykit/plugin-agent-relay` | plugin | `@amykit/agent-kit`, `@amykit/core`, `@amykit/model-specs` |
| `@amykit/plugin-claude` | plugin | `@amykit/agent-kit`, `@amykit/core`, `@amykit/model-specs` |
| `@amykit/plugin-codex` | plugin | `@amykit/agent-kit`, `@amykit/core`, `@amykit/model-specs` |
| `@amykit/plugin-command` | plugin | `@amykit/core` |
| `@amykit/plugin-command-gate` | plugin | `@amykit/core` |
| `@amykit/plugin-concurrent-engine` | plugin | `@amykit/core`, `@amykit/plugin-serial-engine` |
| `@amykit/plugin-file-brief-store` | plugin | `@amykit/core` |
| `@amykit/plugin-file-log` | library | `@amykit/core` |
| `@amykit/plugin-file-notes` | plugin | `@amykit/core`, `@amykit/plugin-notify-fanout`, `@amykit/workflow-note-to-plan` |
| `@amykit/plugin-file-queue` | plugin | `@amykit/core` |
| `@amykit/plugin-file-store` | plugin | `@amykit/core`, `@amykit/plugin-file-brief-store` |
| `@amykit/plugin-file-tasks` | plugin | `@amykit/core`, `@amykit/workflow-errand` |
| `@amykit/plugin-file-worktree` | plugin | `@amykit/core` |
| `@amykit/plugin-github` | plugin | `@amykit/core` |
| `@amykit/plugin-hermes-agent` | plugin | `@amykit/agent-kit`, `@amykit/core`, `@amykit/model-specs` |
| `@amykit/plugin-linear` | plugin | `@amykit/core` |
| `@amykit/plugin-next-steps` | plugin | `@amykit/core` |
| `@amykit/plugin-notify-fanout` | plugin | `@amykit/core` |
| `@amykit/plugin-notify-hermes` | plugin | `@amykit/core`, `@amykit/plugin-notify-fanout` |
| `@amykit/plugin-notify-inbox` | plugin | `@amykit/core`, `@amykit/plugin-notify-fanout` |
| `@amykit/plugin-plan-check` | plugin | `@amykit/core`, `@amykit/workflow-note-to-plan` |
| `@amykit/plugin-prove` | workflow | `@amykit/core` |
| `@amykit/plugin-serial-engine` | plugin | `@amykit/core` |
| `@amykit/plugin-slack` | plugin | `@amykit/core` |
| `@amykit/plugin-telegram` | plugin | `@amykit/core` |
| `@amykit/plugin-terminal` | plugin | `@amykit/core` |
| `@amykit/plugin-terminal-conversation` | plugin | `@amykit/core` |
| `@amykit/plugin-ui-stub` | library | `@amykit/ui` |
| `@amykit/workflow-errand` | workflow | `@amykit/core`, `@amykit/plugin-file-queue`, `@amykit/workflow-pull-request` |
| `@amykit/workflow-feature-grooming` | workflow | `@amykit/core` |
| `@amykit/workflow-note-to-plan` | workflow | `@amykit/core`, `@amykit/plugin-file-queue`, `@amykit/workflow-pull-request` |
| `@amykit/workflow-pull-request` | workflow | `@amykit/core` |
| `@amykit/workflow-ticket-to-qa` | workflow | `@amykit/agent-kit`, `@amykit/core` |

<!-- amy:end workspace-dependencies -->

## The host assembles, the engine drives

The CLI reads the config, imports each plugin it names and mounts them
together. Mounting is where every refusal happens, by name, before any work is
touched:

```ts
import os from "node:os";
import { mount, type CommandRunner, type Plugin } from "@amykit/core";

declare const plugins: Plugin[];
declare const runner: CommandRunner;

const outcome = await mount(plugins, { "@amykit/plugin-file-queue": { directory: "queue" } }, {
  runner,
  now: () => new Date(),
  paths: { state: os.tmpdir() },
});
if (!outcome.ok) throw new Error(outcome.problems.join("\n"));
```

The engine asks the workflow what to do next, runs the actions its declaration
names, and holds the queue, the attempt counts, the budget and the handbrake in
between. A ticket, a pull request and a reviewer appear nowhere in it, so a
workflow over a new domain costs a `workflow.mmd` and one
[`defineWorkflow`](workflows.md) call, not a fork of the engine.

## The logic is code, the reach is data

A decision is a pure function, so a predicate like "the bot reviewed this head
and no thread is outstanding" is written in TypeScript instead of a condition
language.

What is data is the workflow's **reach**: the keys of its `actions`, each
beside what runs it. That lets the host answer at boot whether every action the
workflow can emit has something to run it. An action nothing handles is a boot
refusal, not a surprise halfway through somebody's ticket. See
[Actions](actions.md).

## Where the types live

The core is generic, so type safety comes from the other side. A workflow
declares its own vocabulary (`Ticket`, `Roster`, `Note`, its own record and
effects) and narrows the ports it uses to what it needs of them. Every workflow
shares the one mounted `agent` port without knowing the others exist.

What is domain-free lives in the core: `CodeHost` and the pull request it
returns name a repository, a branch and a login; `Harness` is a prompt, a
directory and an account of what the answer cost.

## The world is reached through interfaces

An adapter reaches the world through the host's `CommandRunner` or through a
transport it takes behind an interface (`GraphQLClient`, an HTTP transport for
Slack and Telegram). So every adapter is tested against scripted answers
instead of the real `gh`, `claude`, `git` or API, and the places to audit are
few and named.

---
title: Packages
description: What is in the box, and how a package nobody here wrote is found.
group: Packages
order: 1
---

# Packages

Everything in amy is a package. The ones below ship in this repository; anything
else is found by two conventions rather than by a list somebody curates.

## In the box

<!-- amy:generated catalog-shipped -->

| Package | Kind | What it is |  |
| :-- | :-- | :-- | :-- |
| `@amy/workflow-errand` | workflow | Something said in passing becomes work: capture it, do it, say what happened. | [npm](https://www.npmjs.com/package/@amy/workflow-errand) |
| `@amy/workflow-note-to-plan` | workflow | The note-to-plan workflow: friction becomes a plan in the repository it is about. | [npm](https://www.npmjs.com/package/@amy/workflow-note-to-plan) |
| `@amy/workflow-ticket-to-qa` | workflow | The ticket-to-QA workflow: its states, its typed port contracts, and a pure plan(). | [npm](https://www.npmjs.com/package/@amy/workflow-ticket-to-qa) |
| `@amy/plugin-agent-relay` | plugin | One agent made of several: swaps harness on a quota, escalates model on a failure. | [npm](https://www.npmjs.com/package/@amy/plugin-agent-relay) |
| `@amy/plugin-claude` | plugin | The claude CLI as the agent, with git on the side. | [npm](https://www.npmjs.com/package/@amy/plugin-claude) |
| `@amy/plugin-codex` | plugin | The codex CLI as the agent, over its JSONL event stream. | [npm](https://www.npmjs.com/package/@amy/plugin-codex) |
| `@amy/plugin-command` | plugin | Any command line tool, reached by a name the config allows. | [npm](https://www.npmjs.com/package/@amy/plugin-command) |
| `@amy/plugin-command-gate` | plugin | A gate that runs the target repository's own commands. | [npm](https://www.npmjs.com/package/@amy/plugin-command-gate) |
| `@amy/plugin-file-notes` | plugin | Friction as a directory of notes: written by hand, by a hook, or by a tick that failed. | [npm](https://www.npmjs.com/package/@amy/plugin-file-notes) |
| `@amy/plugin-file-queue` | plugin | A queue kept as one file per item, claimed by rename. | [npm](https://www.npmjs.com/package/@amy/plugin-file-queue) |
| `@amy/plugin-file-store` | plugin | Work records kept as one file per item. | [npm](https://www.npmjs.com/package/@amy/plugin-file-store) |
| `@amy/plugin-file-tasks` | plugin | Tasks as a directory of files: written by `amy btw`, by an editor, or by a hook. | [npm](https://www.npmjs.com/package/@amy/plugin-file-tasks) |
| `@amy/plugin-github` | plugin | GitHub as the code host, through the gh CLI. | [npm](https://www.npmjs.com/package/@amy/plugin-github) |
| `@amy/plugin-hermes-agent` | plugin | Hermes as the agent, over its one-shot mode and usage report. | [npm](https://www.npmjs.com/package/@amy/plugin-hermes-agent) |
| `@amy/plugin-linear` | plugin | Linear as the tracker, over its GraphQL API. | [npm](https://www.npmjs.com/package/@amy/plugin-linear) |
| `@amy/plugin-notify-fanout` | plugin | Sends one announcement down every configured channel, and keeps going when one is down. | [npm](https://www.npmjs.com/package/@amy/plugin-notify-fanout) |
| `@amy/plugin-notify-hermes` | plugin | Announcements over Hermes, which already owns the messaging credentials. | [npm](https://www.npmjs.com/package/@amy/plugin-notify-hermes) |
| `@amy/plugin-notify-inbox` | plugin | Announcements as a file on disk plus a desktop notification. | [npm](https://www.npmjs.com/package/@amy/plugin-notify-inbox) |
| `@amy/plugin-plan-check` | plugin | The quality bar for a drafted plan: the repository's own check, run in its checkout. | [npm](https://www.npmjs.com/package/@amy/plugin-plan-check) |
| `@amy/plugin-serial-engine` | plugin | Advances one work item by one move per tick. | [npm](https://www.npmjs.com/package/@amy/plugin-serial-engine) |

<!-- amy:end catalog-shipped -->

## Everything else

There is no central index, and that is deliberate. A curated list here would be
stale the day somebody publishes, and a package would have to ask permission to
exist.

So discovery is two conventions:

| Where | Query |
| :-- | :-- |
| **npm** | packages with the `amy-plugin` keyword |
| **GitHub** | repositories with the `amy-plugin` topic |

```sh
npm search keywords:amy-plugin
gh search repos --topic amy-plugin
```

Anything either query returns is installable the same way everything else is:

```sh
npm install -g @acme/plugin-jira
```

```yaml
workflows:
  ticket-to-qa:
    plugins: ["@acme/plugin-jira", "…"]
```

## Installing one is a trust decision

A plugin resolves by name at run time and runs in-process with everything else.
Installing one is the same decision as installing any npm package, and being
listed by a keyword is not an endorsement by anybody.

The things worth looking at before you mount one: what port it claims, what it
reads from the environment, and whether it reaches the world through
`CommandRunner`. A plugin doing its own `child_process` is not wrong, but it is
outside the boundary everything else here is tested at.

## Getting yours listed

Add the keyword and the topic. That is it — see
[Publishing a package](publishing-a-package.md).

---
title: Plugins and the registry
description: What a plugin is, what it can register, and how the host mounts it or refuses it at boot.
group: How it works
order: 4
---

# Plugins and the registry

A plugin is a package exporting one `plugin` object, written with
`definePlugin`:

```ts
import { definePlugin, type Tracker } from "@amykit/core";

declare class JiraTracker {
  constructor(site: string, project: string | undefined);
}
declare function asTracker(jira: JiraTracker): Tracker;

export const plugin = definePlugin({
  name: "@acme/plugin-jira",
  configSchema: {
    site: { type: "string", description: "the Jira site, as https://acme.atlassian.net", required: true },
    project: { type: "string", description: "the project key work is read from" },
  },
  register(registry, ctx) {
    // ctx.config is typed by the schema: site is a string, project may be undefined.
    registry.port("tracker", asTracker(new JiraTracker(ctx.config.site, ctx.config.project)));
  },
});
```

That is the contract. Its version is the one in its `package.json`, never a
field on the plugin ([nothing is declared twice](../design/nothing-is-declared-twice.md)),
and so is `amy.about`, the paragraph its README shows. Everything below is what the
host does with it.

## Loaded, then mounted

amy reads the plugin list from the config, imports each by package name or
path, takes its `plugin` export, and mounts them all together. Nothing is
compiled in, so an install can carry a plugin this repository has never heard
of. A package that is not there is told apart from a plugin that threw, and the
answer lists what *is* installed.

## Every way the mount refuses

All of these happen at boot, by name, before any work is touched, and every
problem is reported at once, so one boot fixes one round of edits.

| Refusal | Message |
| :-- | :-- |
| A plugin will not import | `not installed — install it, or drop it from the config` |
| A plugin threw while registering | `failed to mount — <what it said>` |
| A setting is the wrong type | `` `retentionDays` must be number, got string — <what the field is for> `` |
| A required setting is missing | `` `repos` is required — <what the field is for> `` |
| A setting it never declared | `` `retentionDay` is not a setting this plugin has `` |
| Settings for a plugin with no schema | `has no settings, but the config gives it some` |
| A port claimed twice | `` the `tracker` port is already mounted by another plugin `` |
| The queue, store or engine claimed twice | `the queue is already mounted by another plugin` |
| A name taken twice in one collection | `` `claude` is already in the `harness` collection `` |
| An action nothing defines | `` action `escalate`: nothing defines it `` |
| An action whose port is not mounted | `` action `triage`: needs the `agent` port, which nothing mounted `` |

## Config schemas

`configSchema` says what the plugin's settings look like, and the host
validates them without knowing what any of them mean. A field is `string`,
`number`, `boolean`, `string[]` or `record`, and that ceiling is deliberate: a
plugin that needs more shape validates it itself. The `description` is printed
when the field is missing or wrong.

`definePlugin` infers the schema, so `ctx.config` is typed by it: a field that
is `required` or has a `default` is present, any other may be `undefined`, and
a `default` of the wrong type fails to compile. Why: [a config is typed by its
schema](../design/a-config-is-typed-by-its-schema.md). A plugin that needs a
repository's base branch spreads `BRANCH_SETTINGS` into its schema and asks
`ctx.checkouts()` ([Ports](ports.md#checkouts)).

## What a plugin is lent

`register(registry, ctx)` gets a `PluginContext`: its own `config`, already
validated; the `runner`, the only way to a child process; `now()`, so tests
drive time; the event `log`; the host's `paths`; `readOnly`; and
`checkouts()`. It also gets `port(kind)`, `contributions(collection)` and
`workflow()`, which are read when asked, so a plugin sees what was registered
after it.

## What a plugin can register

The `Registry` takes a queue, a store, an engine, a port, an action with the
port that runs it, and a contribution to a named collection. It also takes a
workflow, but that is the core's own contract for its tests: amy mounts only a
workflow written with [`defineWorkflow`](workflows.md).

**A port** is a named slot. One plugin fills it; a second one trying is a
refusal. See [Ports](ports.md).

**An action the core does not have** may be registered, and then the plugin
brings the port that runs it in the same package: an action nobody can execute
is a promise the machine cannot keep. See [Actions](actions.md).

**A contribution** adds to a named collection that some other plugin reads.
The core does not know what a collection means. It is how the harnesses reach
the agent relay and the notification channels reach the fan-out.

<!-- amy:generated collections -->

| Collection | Contributed to by | Read by |
| :-- | :-- | :-- |
| `harness` | `claude` — `@amykit/plugin-claude`<br>`codex` — `@amykit/plugin-codex`<br>`hermes` — `@amykit/plugin-hermes-agent` | `@amykit/agent-kit` |
| `notify-channel` | `hermes` — `@amykit/plugin-notify-hermes`<br>`inbox` — `@amykit/plugin-notify-inbox` | _whichever plugin reads it_ |
| `usage` | `Claude` — `@amykit/plugin-claude`<br>`Codex` — `@amykit/plugin-codex`<br>`Hermes ()` — `@amykit/plugin-hermes-agent` | `@amykit/agent-kit` |
| `workflow-runtime` | `errand` — `@amykit/workflow-errand`<br>`feature-grooming` — `@amykit/workflow-feature-grooming`<br>`note-to-plan` — `@amykit/workflow-note-to-plan`<br>`prove` — `@amykit/plugin-prove`<br>`pull-request` — `@amykit/workflow-pull-request`<br>`setup` — `@amykit/workflow-setup`<br>`ticket-to-qa` — `@amykit/workflow-ticket-to-qa` | `@amykit/agent-kit` |

<!-- amy:end collections -->

## Deferred, and why plugin order does not matter

Wherever an implementation is registered (`port`, `engine`, `contribute`), a
`deferred` one may be instead:

```ts
import { definePlugin, deferred, type Harness } from "@amykit/core";

declare function relay(harnesses: ReadonlyMap<string, object>, ladder: string[]): Harness;

export const plugin = definePlugin({
  name: "@acme/plugin-relay",
  configSchema: { ladder: { type: "string[]", description: "harness:model pairs, tried in order", default: [] } },
  register(registry, ctx) {
    // Built once every plugin has registered, so a harness listed after this one is there.
    registry.port("agent", deferred(() => relay(ctx.contributions("harness"), ctx.config.ladder)));
  },
});
```

The host builds every deferred implementation once per mount, after every
plugin has registered and before any `ready`. One that reads another through
`ctx.port` or `ctx.contributions` gets it built on demand; two that read each
other are refused, naming both. A factory that throws is refused like a
`register` that throws. Whoever reads the port receives the built object.

The relay is the case it exists for: its ladder names harnesses other plugins
contribute, and a ladder naming one nobody contributed is a refusal at boot
rather than a ticket escalating for no reason. Why: [a mount builds
once](../design/a-mount-builds-once.md).

`ready(ctx)` is for judging, not building. It runs after every deferred
implementation is built, for a plugin whose settings cannot be judged before
then, and throwing in it is a refusal at boot.

The exported `plugin` is a module singleton, shared by every host in the
process. Build what you mount inside `register` or in a `deferred`, from `ctx`,
never in a field on the plugin.

## Every shipped plugin

<!-- amy:generated plugin-index -->

| Plugin | What it is | Mounts | Contributes |
| :-- | :-- | :-- | :-- |
| `@amykit/plugin-agent-browser` | Drives a web page through agent-browser: open, snapshot, act on refs, diff, and a UI check that settles on structure, then pixels, then an agent. |  |  |
| `@amykit/plugin-agent-desktop` | Drives a desktop app through agent-desktop: snapshot its accessibility tree and act on its refs. |  |  |
| `@amykit/plugin-agent-relay` | One agent made of several: swaps harness on a quota, escalates model on a failure. | `agent` |  |
| `@amykit/plugin-claude` | The claude CLI as the agent, over its JSON envelope. |  | `harness:claude`<br>`usage:Claude` |
| `@amykit/plugin-codex` | The codex CLI as the agent, over its JSONL event stream. |  | `harness:codex`<br>`usage:Codex` |
| `@amykit/plugin-command` | Any command line tool, reached by a name the config allows. | `commands` |  |
| `@amykit/plugin-command-gate` | A gate that runs the target repository's own commands. | `gate` |  |
| `@amykit/plugin-concurrent-engine` | Advances one work item per tick, moving every lane of a fork at once. | the engine |  |
| `@amykit/plugin-file-brief-store` | Briefs kept as one file per item. | `brief` |  |
| `@amykit/plugin-file-notes` | Friction as a directory of notes: written by hand, by a hook, or by a tick that failed. | `notes` |  |
| `@amykit/plugin-file-queue` | A queue kept as one file per item, claimed by rename. | `queue` |  |
| `@amykit/plugin-file-store` | Work records kept as one file per item. | `store` |  |
| `@amykit/plugin-file-tasks` | Tasks as a directory of files: written by `amy btw`, by an editor, or by a hook. | `tasks` |  |
| `@amykit/plugin-file-worktree` | One isolated checkout per piece of work, created or reused, pruned by retention. | `workspace`<br>`worktree` |  |
| `@amykit/plugin-github` | GitHub as the code host, through the gh CLI. | `code-host` |  |
| `@amykit/plugin-hermes-agent` | Hermes as the agent, over its one-shot mode and usage report. |  | `harness:hermes`<br>`usage:Hermes ()` |
| `@amykit/plugin-linear` | Linear as the tracker, over its GraphQL API. | `feature`<br>`tracker` |  |
| `@amykit/plugin-next-steps` | A next-steps table as the tracker: a row is a work item, its plan the body, read from the base branch. | `tracker` |  |
| `@amykit/plugin-notify-fanout` | Posts announcements to a mounted conversation, or fans them out through configured channels when no conversation is mounted. | `notifier` |  |
| `@amykit/plugin-notify-hermes` | Announcements over Hermes, which already owns the messaging credentials. | `notify` | `notify-channel:hermes` |
| `@amykit/plugin-notify-inbox` | Announcements as a file on disk plus a desktop notification. |  | `notify-channel:inbox` |
| `@amykit/plugin-plan-check` | The quality bar for a drafted plan: the repository's own check, run in its checkout. | `plan-check` |  |
| `@amykit/plugin-serial-engine` | Advances one work item by one move per tick. | the engine |  |
| `@amykit/plugin-slack` | A Slack thread per piece of work, over the Web API, as the conversation port. | `conversation` |  |
| `@amykit/plugin-telegram` | A topic per piece of work in the operator's private chat with a Telegram bot, as the conversation port. | `conversation` |  |
| `@amykit/plugin-terminal` | Drives an interactive terminal program through terminal-use: run it, type, press keys, wait for text and read the screen. |  |  |
| `@amykit/plugin-terminal-conversation` | The person's terminal as an amy conversation: asks post to stdout, and answers come back as a line or a number. | `conversation` |  |

<!-- amy:end plugin-index -->

## Writing one

[Write a plugin](../guides/write-a-plugin.md) goes from an empty package to a
proven one.

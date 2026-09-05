---
title: Plugins and the registry
description: How a plugin is assembled rather than constructed, and every way mount() refuses.
group: How it works
order: 3
---

# Plugins and the registry

A plugin is a package exporting one object:

```ts
export const plugin: Plugin = {
  name: "@amy/plugin-file-queue",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    registry.queue(new FileQueue(path.join(ctx.paths.state, ctx.config.directory as string)));
  },
};
```

That is the entire contract. Everything below is what the host does with it.

## Assembled, not constructed

Plugins are **loaded from the config and assembled**, not built by the CLI:

```ts
const loaded = await load(specs);              // import each by name
const outcome = await mount(loaded.plugins, config, host);
```

`load` imports each spec — a package name, or a path — and takes its `plugin`
export. Nothing is compiled in, which is what lets an install carry a plugin
this repository has never heard of, and lets a machine skip the ones it has no
use for.

A package that is not there is told apart from a plugin that threw, and answered
once with the list of what *is* installed:

```
amy could not start:
  @acme/plugin-jira: not installed — install it, or drop it from the config

Installed: @amy/plugin-claude, @amy/plugin-file-queue, …
```

## Every way mount() refuses

All of these happen at boot, by name, before any work is touched. That is the
point of assembling rather than constructing: the alternative is finding out
halfway through somebody's ticket.

| Refusal | Message |
| :-- | :-- |
| A plugin will not import | `not installed — install it, or drop it from the config` |
| A plugin imported but exports nothing | `imported, but exports no \`plugin\`` |
| A plugin threw while registering | `failed to mount — <what it said>` |
| A setting is the wrong type | `` `retentionDays` must be number, got string — <what the field is for> `` |
| A required setting is missing | `` `repos` is required — <what the field is for> `` |
| A setting is not one it declared | `` `retentionDay` is not a setting this plugin has `` |
| A plugin with no schema was given settings | `has no settings, but the config gives it some` |
| Two plugins claim the same port | `` the `tracker` port is already mounted by another plugin `` |
| Two plugins claim the queue, store, engine or workflow | `the queue is already mounted by another plugin` |
| Two contributions collide in one collection | `` `claude` is already in the `agent` collection `` |
| The workflow emits an action nothing defines | `` action `escalate`: nothing defines it `` |
| An action's port is not mounted | `` action `triage`: needs the `agent` port, which nothing mounted `` |
| An observation nothing contributes | `` observation `tracker`: nothing contributes it `` |

**Every problem is reported, not just the first.** One boot fixes one round of
edits.

## What a plugin is lent

```ts
interface PluginContext {
  readonly config: Record<string, unknown>;   // its own slice, already validated
  readonly runner: CommandRunner;             // the only way to a child process
  readonly now: () => Date;                   // never `new Date()`, so tests can drive time
  readonly log?: EventLog;
  readonly paths: HostPaths;                  // { workspace, state }
  contributions(collection: string): ReadonlyMap<string, object>;
  port(kind: PortKind): object | undefined;
  workflow(): Workflow<never, never> | undefined;
}
```

The last three are **live views**, and that matters more than it looks. A plugin
that composes others cannot see contributions made after it, so it reads them
*when it is used* rather than when it is mounted. Otherwise the order plugins
appear in the config would be something an operator has to get right.

## The five things a plugin can register

```ts
interface Registry {
  queue(impl): void;
  store(impl): void;
  engine(impl): void;
  workflow(impl): void;
  port(kind, impl): void;
  action(name, spec, port): void;
  observer(slice, source): void;
  contribute(collection, name, impl): void;
}
```

**A port** is a named slot. One plugin fills it; a second one trying is a
refusal. See [Ports](ports.md).

**An action the core does not have** may be registered, and when it is, the
plugin **has to bring the port that runs it in the same package**. The pair is
inseparable on purpose: an action nobody can execute is a promise the machine
cannot keep. If such an action proves general it graduates into the core, by
evidence rather than guess.

**An observation** is one named slice of what a workflow reads before deciding.

**A contribution** adds to a named collection that some other plugin consumes.

## Collections

The core does not know what a collection *means*, only that several plugins may
add to one and something else will read it. It is how the notification channels
reach the fan-out without the core learning the word "channel".

<!-- amy:generated collections -->

| Collection | Contributed to by | Read by |
| :-- | :-- | :-- |
| `agent` | `claude` — `@amy/plugin-claude`<br>`codex` — `@amy/plugin-codex`<br>`hermes` — `@amy/plugin-hermes-agent` | `@amy/agent-kit` |
| `harness` | `claude` — `@amy/plugin-claude`<br>`codex` — `@amy/plugin-codex`<br>`hermes` — `@amy/plugin-hermes-agent` | `@amy/agent-kit` |
| `notify-channel` | `hermes` — `@amy/plugin-notify-hermes`<br>`inbox` — `@amy/plugin-notify-inbox`<br>`tracker` — `@amy/plugin-linear` | _whichever plugin reads it_ |
| `workflow-runtime` | `errand` — `@amy/workflow-errand`<br>`note-to-plan` — `@amy/workflow-note-to-plan`<br>`ticket-to-qa` — `@amy/workflow-ticket-to-qa` | `@amy/agent-kit` |

<!-- amy:end collections -->

A collection is read **when it is used, not when it is mounted**, so the order
plugins are listed in does not matter.

## `ready()`, and why it exists

```ts
ready?(ctx: PluginContext): void | Promise<void>;
```

Checked once every plugin has registered, and only for a plugin whose settings
cannot be judged before then.

The agent relay is the case it exists for. Its `ladder: [claude:sonnet,
codex:gpt-5]` names harnesses that *other plugins contribute*, and it cannot
tell whether that list makes sense until they have. Throwing in `ready` is a
refusal at boot, named — the same promise `register` makes.

A ladder that quietly meant less than it says would first show up as a ticket
escalating for no reason.

## Config schemas

A plugin declares what its settings look like, and the host validates them
without knowing what any of them mean:

```ts
export const configSchema: ConfigSchema = {
  directory: {
    type: "string",
    description: "where the queue is kept, relative to the state directory",
    default: "queue",
  },
  retentionDays: { type: "number", description: "…", default: 7 },
};
```

Five types only — `string`, `number`, `boolean`, `string[]`, `record` — and that
ceiling is deliberate. A plugin that needs more shape than this wants its own
validation, not a bigger schema language in the host.

The `description` is not decoration: it is printed when the field is missing or
wrong. `"invalid config"` with nothing else in it is the error message that
costs an hour.

## Singletons, and the trap in them

The exported `plugin` is a **module singleton**. A field on it would be shared
by every host in the same process, and the second mount would answer with the
first one's state.

The shipped plugins that build something expensive key it by context:

```ts
const relays = new WeakMap<PluginContext, AgentRelay>();
```

The context is per mount, which makes it the right key. If your plugin holds
anything built from `ctx`, do the same.

## Every shipped plugin

<!-- amy:generated plugin-index -->

| Plugin | What it is | Mounts | Contributes |
| :-- | :-- | :-- | :-- |
| `@amy/plugin-agent-relay` | One agent made of several: swaps harness on a quota, escalates model on a failure. | `agent` |  |
| `@amy/plugin-claude` | The claude CLI as the agent, with git on the side. |  | `agent:claude`<br>`harness:claude` |
| `@amy/plugin-codex` | The codex CLI as the agent, over its JSONL event stream. |  | `agent:codex`<br>`harness:codex` |
| `@amy/plugin-command` | Any command line tool, reached by a name the config allows. | `commands` |  |
| `@amy/plugin-command-gate` | A gate that runs the target repository's own commands. | `gate` |  |
| `@amy/plugin-file-notes` | Friction as a directory of notes: written by hand, by a hook, or by a tick that failed. | `notes` |  |
| `@amy/plugin-file-queue` | A queue kept as one file per item, claimed by rename. | `queue` |  |
| `@amy/plugin-file-store` | Work records kept as one file per item. | `store` |  |
| `@amy/plugin-file-tasks` | Tasks as a directory of files: written by `amy btw`, by an editor, or by a hook. | `tasks` |  |
| `@amy/plugin-github` | GitHub as the code host, through the gh CLI. | `code-host` |  |
| `@amy/plugin-hermes-agent` | Hermes as the agent, over its one-shot mode and usage report. |  | `agent:hermes`<br>`harness:hermes` |
| `@amy/plugin-linear` | Linear as the tracker, over its GraphQL API. | `tracker` | `notify-channel:tracker` |
| `@amy/plugin-notify-fanout` | Sends one announcement down every configured channel, and keeps going when one is down. | `notifier` |  |
| `@amy/plugin-notify-hermes` | Announcements over Hermes, which already owns the messaging credentials. |  | `notify-channel:hermes` |
| `@amy/plugin-notify-inbox` | Announcements as a file on disk plus a desktop notification. |  | `notify-channel:inbox` |
| `@amy/plugin-plan-check` | The quality bar for a drafted plan: the repository's own check, run in its checkout. | `plan-check` |  |
| `@amy/plugin-serial-engine` | Advances one work item by one move per tick. | the engine |  |

<!-- amy:end plugin-index -->

## Writing one

[Write a plugin](../build/write-a-plugin.md) goes from an empty package to a proven
one, including the gate that expires when you change it.

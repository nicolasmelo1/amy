---
title: Write a plugin
description: One definePlugin call with a typed config, the things it can register, and how to keep it once it ships.
group: Guides
order: 5
---

# Write a plugin

A [plugin](../concepts/glossary.md#plugin) is an npm package that exports one
object named `plugin`. amy imports it by name, checks its settings, and calls its
`register`. Nothing in amy changes when you add one.

This page writes an adapter for a pager amy has never heard of. Swap in your own
tool; the shape stays the same.

## Start from definePlugin

<!-- amy:file plugin.ts -->
```ts
import { definePlugin } from "@amykit/core";

export class Pager {
  constructor(private readonly site: string, private readonly team: string | undefined) {}

  async page(message: string): Promise<{ paged: string }> {
    return { paged: `${this.team ?? "everyone"} at ${this.site}: ${message}` };
  }
}

export const plugin = definePlugin({
  name: "@acme/plugin-pager",
  configSchema: {
    site: { type: "string", required: true, description: "the pager site, such as acme.pager.example" },
    team: { type: "string", description: "who gets paged; everyone when unset" },
    retries: { type: "number", default: 2, description: "how many times a page is retried" },
  },
  register(registry, ctx) {
    const site: string = ctx.config.site;
    const team: string | undefined = ctx.config.team;
    const retries: number = ctx.config.retries;
    if (retries < 0) throw new Error("`retries` cannot be negative");
    registry.port("pager", new Pager(site, team));
  },
});
```

The schema is the type. `definePlugin` reads the literal you pass and hands
`register` a `ctx.config` shaped by it: a `required` field or one with a
`default` is always there, any other may be `undefined`. A `default` of the wrong
type does not compile, and there is no cast to keep in step with the schema. Why:
[a config is typed by its schema](../design/a-config-is-typed-by-its-schema.md).

At boot the host checks each plugin's settings against its schema and refuses a
missing required field, a wrong type, or a key the schema does not declare. The
`description` is what it prints when it refuses, so write it for that moment.
Field types are `string`, `number`, `boolean`, `string[]` and `record`, and a
dotted key (`policy.maxAttempts`) describes one setting inside a group.

Throwing from `register` is a refusal at boot that names your plugin. Throw when
the settings make no sense; never return a half-built [port](../concepts/glossary.md#port).

Reach the outside world through `ctx.runner` and read the time from `ctx.now()`.
A test can then script both.

## What a plugin can register

The `registry` handed to `register` can:

- mount a port by name with `port`, claimed once per machine;
- add an [action](../concepts/glossary.md#action) the core does not ship with `action`, always together with the
  port that runs it;
- add to a named collection another plugin reads with `contribute`, which is how
  notification channels reach the fan-out;
- mount the [engine](../concepts/glossary.md#engine), the queue or the store;
- register a [workflow](../concepts/glossary.md#workflow).

The [Plugins](../concepts/plugins.md) page has the full Registry type, generated.

## Why plugin order does not matter

A plugin often needs something another one registers, and that one may be listed
after it. Register a `deferred` implementation and let the host build it:

```ts
import { deferred, definePlugin } from "@amykit/core";

class Relay {
  constructor(readonly harnesses: ReadonlyMap<string, object>) {}
}

export const plugin = definePlugin({
  name: "@acme/plugin-relay",
  configSchema: {},
  register(registry, ctx) {
    registry.port("agent", deferred(() => new Relay(ctx.contributions("harness"))));
  },
});
```

The host calls the factory once every plugin has registered, once per mount, and
before any `ready`. A factory that reads another deferred port gets it built on
demand; two that read each other are refused at boot, naming both. `port`,
`engine` and `contribute` all accept one. Why:
[a mount builds once](../design/a-mount-builds-once.md).

The same rule keeps the exported `plugin` free of fields: it is one object per
process, so anything stored on it leaks between mounts. Build what you mount
inside `register`, from `ctx`.

`ready(ctx)` is for a plugin that can only judge its settings once everything is
mounted, such as a ladder naming [harnesses](../concepts/glossary.md#harness) others contribute. Throwing there is
the same refusal.

## Operations become commands

A plugin brings no commands of its own. It declares `operations`, and each one
becomes a command when it names `cli` words, an entry in `amy contract`, and
something an action can call by id. Installing the plugin adds all of them;
removing it takes them away.

```ts
import { defineOperation, definePlugin, fail, scopeOf } from "@amykit/core";
import { z } from "zod";

const page = defineOperation({
  id: "pager.page",
  domain: "pager",
  summary: "Page the on-call team",
  description: "Sends one page. Waits for nobody to answer.",
  input: z.object({ message: z.string().describe("what to say") }),
  output: z.object({ paged: z.string().describe("who was paged") }),
  errors: { "pager.empty": { description: "the message was empty" } },
  writes: [],
  http: { method: "post", path: "/pager/pages" },
  cli: { words: ["page"], positional: ["message"] },
  examples: [{ summary: "a page", input: { message: "disk full" }, output: { paged: "ops" } }],
  async handler({ message }, context) {
    const { settings } = scopeOf<{ team?: string }>(context, "pager.page");
    if (message === "") return fail("pager.empty", "there is nothing to page about");
    return { paged: settings.team ?? "everyone" };
  },
});

export const plugin = definePlugin({
  name: "@acme/plugin-pager-command",
  configSchema: { team: { type: "string", description: "who gets paged" } },
  operations: [page],
  register() {},
});
```

That is `amy page <message>`. The command line builds its arguments from the input
schema and draws the output from the output schema; `--json` prints it as JSON.
An operation answers before anything mounts unless it declares `mount: true`.
Why: [a plugin brings operations, not commands](../design/a-plugin-brings-operations-not-commands.md).

## Environment and checks

```ts
import { definePlugin } from "@amykit/core";

export const plugin = definePlugin({
  name: "@acme/plugin-pager-doctor",
  configSchema: { site: { type: "string", required: true, description: "the pager site" } },
  environment: ["PAGER_API_TOKEN"],
  checks: [
    {
      name: "pager site",
      run: ({ settings }) => ({ label: "pager site", ok: settings.site.includes("."), detail: settings.site }),
    },
  ],
  register() {},
});
```

`environment` lists the variables the plugin reads. `amy doctor` asks for each
one, and only on a machine that mounts the plugin. `checks` run in `amy doctor`
after its own, under your plugin's name. `files` and `setup` are what `amy init`
and `amy add` write or prepare when the plugin arrives.

## Keep a plugin

In this repository a plugin's README is generated by `npm run docs:generate`, and
nothing in it is written by hand. The table of what it extends (ports, actions,
operations, commands, events, environment) is read from the package itself. The
paragraph saying when to use it is `amy.about` in its `package.json`:

```json
{
  "amy": { "about": "Use it when your on-call rotation pages through Acme Pager." }
}
```

A plugin outside this repository writes its own README, and a reader needs the
same from it: what it extends, and when to use it.

To publish, follow [Publishing](../build/publishing.md): an ES module with an
`exports` map, and the `amy-plugin` keyword so the [catalogue](../catalog/index.md)
finds it. People then install it with [`amy add`](install-a-plugin.md).

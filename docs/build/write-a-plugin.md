---
title: Write a plugin
description: From an empty package to a mounted, validated, published adapter — with the failure modes named.
group: Build your own
order: 1
---

# Write a plugin

A plugin is a package exporting one object. There is no build step to learn, no
registration to file, and nothing in amy has to change.

This page writes one end to end: an adapter for a tracker amy has never heard
of. Substitute your own tool; the shape does not change.

## 1. The smallest thing that mounts

```sh
mkdir acme-plugin-jira && cd acme-plugin-jira
npm init -y
npm install @amykit/core
```

```json
// package.json
{
  "name": "@acme/plugin-jira",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "dependencies": { "@amykit/core": "^0.4.0" }
}
```

```ts
// src/index.ts
import type { Plugin } from "@amykit/core";

export const plugin: Plugin = {
  name: "@acme/plugin-jira",
  register() {},
};
```

```yaml
# ~/.amy/config.yaml
workflows:
  ticket-to-qa:
    workflow: "@amykit/workflow-ticket-to-qa"
    plugins: ["@acme/plugin-jira", "…"]
```

```sh
npm install -g .
amy plugin list
```

It mounts and does nothing. Everything below is filling it in.

> `type: "module"` and the `exports` map are not optional. amy imports your
> package by name at run time; a CommonJS package or a missing `exports` is a
> refusal you will read as "not installed".

## 2. Declare your settings

Do this before writing any logic. It is what turns a typo in somebody's config
into a message at boot rather than a `undefined is not a function` three layers
deep.

```ts
// src/config.ts
import type { ConfigSchema } from "@amykit/core";

export const configSchema: ConfigSchema = {
  site: {
    type: "string",
    required: true,
    description: "the Jira site, e.g. `acme.atlassian.net`",
  },
  project: {
    type: "string",
    required: true,
    description: "the project key work is picked up from",
  },
  workingStatusName: {
    type: "string",
    description: "the status a ticket must be in to be picked up, matched by name",
    default: "In Progress",
  },
};
```

Five types: `string`, `number`, `boolean`, `string[]`, `record`. The ceiling is
deliberate — a plugin that needs more shape than this wants its own validation,
not a bigger schema language in the host.

**Write the `description` for the moment it is printed.** It is shown when the
field is missing or wrong:

```
@acme/plugin-jira: `site` is required — the Jira site, e.g. `acme.atlassian.net`
```

Now the host will refuse, at boot: a missing required field, a wrong type, and a
key that is not one of yours. And a plugin that declares **no** schema is
refused any settings at all, because a setting nobody reads is one somebody
believes is working.

## 3. Fill a port

```ts
// src/plugin.ts
import type { Plugin } from "@amykit/core";
import { JiraTracker } from "./JiraTracker.js";
import { configSchema } from "./config.js";

export const plugin: Plugin = {
  name: "@acme/plugin-jira",
  configSchema,
  register(registry, ctx) {
    const key = process.env.JIRA_API_TOKEN;
    if (!key) {
      // Thrown, not swallowed: mount turns it into a problem naming this
      // plugin, which is more useful than a tracker that answers nothing.
      throw new Error(
        "JIRA_API_TOKEN is not set. Create an API token in Atlassian account " +
          "settings and put it in ~/.amy/.env",
      );
    }

    registry.port("tracker", new JiraTracker(ctx.runner, {
      site: ctx.config.site as string,
      project: ctx.config.project as string,
      workingStatusName: ctx.config.workingStatusName as string,
    }));
  },
};
```

Which methods `JiraTracker` needs are the ones **the workflow** calls, not the
ones the core declares — a workflow narrows the port it uses. Import the
workflow's interface and let the compiler tell you:

```ts
import type { Tracker } from "@amykit/workflow-ticket-to-qa";

export class JiraTracker implements Tracker { … }
```

That is the only reason an adapter ever depends on a workflow package: for the
types that workflow declares. Never for its logic.

### Reach the world through the runner

```ts
const result = await this.runner.run("curl", ["-s", url], { timeoutMs: 30_000 });
```

Nothing reaches the outside world except through `CommandRunner` or
`GraphQLClient`. That is what lets every adapter be tested against a scripted
answer instead of a real API, and it is the complete list of places anybody has
to audit.

### Never call `new Date()`

Use `ctx.now()`. A test that cannot drive time is a test that either sleeps or
lies.

## 4. The other things you can register

### Contribute to a collection

Several plugins add to one named collection that another consumes. This is how
notification channels reach the fan-out without the core learning the word
"channel":

```ts
import { CHANNEL_COLLECTION } from "@amykit/plugin-notify-fanout";

registry.contribute(CHANNEL_COLLECTION, "jira", jiraCommentChannel(tracker));
```

A collection is read **when it is used, not when it is mounted**, so the order
plugins appear in the config does not matter.

### Add an action the core does not have

You may — and when you do, you bring the port that runs it in the same package:

```ts
registry.action("page-oncall", { port: "pager", method: "page" }, new PagerDutyPager(ctx.runner));
```

The pair is inseparable on purpose. An action nobody can execute is a promise
the machine cannot keep.

A workflow that emits it still declares it, in its runtime's `actions`. If the
port's method takes the action and its context and says so —
`page: acceptsAction(async (action, context) => …)` — that declaration can be
the port and the method themselves, `"page-oncall": { port: "pager", method: "page" }`,
and the host calls it with no handler written; what it returns lands in
`outcomes` under the action's name. A method that takes its own arguments is
refused there at boot, because it would run on the wrong ones.

### Mount an engine, a queue or a store

```ts
registry.queue(new RedisQueue(ctx.config.url as string));
registry.store(new SqliteStore(ctx.config.file as string));
registry.engine(new ConcurrentEngine(…));
```

Each is claimed once. A second plugin claiming the same one is a refusal naming
both.

### Bring an operation to every door

A plugin does not write commands. It declares **operations**, and every door
is drawn from them: the command line, `amy contract`, and a workflow's action.
Installing the plugin adds all three at once; removing it takes all three away.

```ts
import { defineOperation, definePlugin, fail, scopeOf } from "@amykit/core";
import { z } from "zod";

const greet = defineOperation({
  id: "greeting.greet",
  domain: "greeting",
  summary: "Greet somebody",                       // what amy --help prints
  description: "Answers a greeting. Remembers nobody.",
  input: z.object({
    who: z.string().describe("who to greet"),
    times: z.number().int().default(1).describe("how many times"),
  }),
  output: z.object({ text: z.string().describe("said") }),
  errors: { "greeting.nobody": { description: "the name was empty" } },
  writes: [],
  http: { method: "post", path: "/greetings" },
  cli: { words: ["greet"], positional: ["who"] }, // amy greet <who> [--times <number>]
  examples: [{ summary: "one name", input: { who: "Ada" }, output: { text: "hello, Ada" } }],
  async handler({ who, times }, context) {
    const { settings } = scopeOf<{ greeting: string }>(context, "greeting.greet");
    if (who === "") return fail("greeting.nobody", "there is nobody to greet");
    return { text: `${settings.greeting}, ${who}`.repeat(times) };
  },
});

export const plugin = definePlugin({ name: "@acme/plugin-greeting", configSchema, operations: [greet], register() {} });
```

What the command line does with it, without a line of yours:

- **Arguments come from the input schema.** Each field named in `positional` is
  an argument; every other field is a flag (`staleAfter` is `--stale-after`).
  A number is parsed, a boolean is a bare flag, an array repeats, an enum lists
  its values in the help. A value that does not parse is refused with exit 2,
  naming the flag.
- **The output is drawn from itself and its schema.** An object prints as
  labelled fields, an array of objects as a table, an enum coloured; a field's
  label is its `title`, else its description, else its name — so keep
  descriptions short. No operation draws its own terminal output.
- **`--json` is for whatever reads it.** The output as JSON, a stream as JSON
  Lines, an error as the `{ code, message, details? }` envelope on stderr.
- **The exit code is the outcome:** 0 an output, 1 a declared error, 2 an input
  refused, 70 anything the operation never declared.
- `cli.default: true` makes an operation what its group means alone:
  `roster show` with it is also `amy roster`.

An operation is read before anything mounts, so it answers on a machine that
will not boot. One that needs the ports declares `mount: true` and reads them
with `context.port(name)`; when the machine will not assemble it is refused,
naming why. It is local-only in `amy contract` unless it says `localOnly: false`.

An operation id and a command's first word each belong to one package; a second
claiming either is refused at load, naming both. A plugin still declaring
`commands` is refused at load too: that member is gone.

A workflow's action reaches another plugin's operation by id —
`await operate("greeting.greet", { who: "Ada" })` — and gets `{ ok: true, output }`
or `{ ok: false, error }` for a declared error, an input the schema refused, or
an id no plugin its profile mounts offers.

## 5. Validate what you cannot judge alone

If your plugin *composes* others, its settings cannot be checked in `register` —
the plugins it composes may be listed after it. When what you mount is built
from them, register it `deferred` (below) and throw from the factory. When there
is only something to judge, that is what `ready` is for:

```ts
ready(ctx) {
  const contributed = [...ctx.contributions("pager").keys()];
  const wanted = ctx.config.order as string[];

  const missing = wanted.filter((name) => !contributed.includes(name));
  if (missing.length > 0) {
    throw new Error(
      `\`order\` names ${missing.join(", ")}, which nothing contributed. ` +
        `Contributed: ${contributed.join(", ") || "nothing"}`,
    );
  }
}
```

Throwing here is a refusal at boot, named — the same promise `register` makes. A
config that quietly means less than it says is worse than one that will not
load.

## 6. Do not put state on the plugin object

The exported `plugin` is a **module singleton**. A field on it is shared by every
host in the process, and the second mount answers with the first one's state.

Build what you mount inside `register`, from its `ctx`, which is per mount. When
it needs something another plugin registers — possibly after yours — register
it `deferred` and let the host build it:

```ts
registry.port("tracker", deferred(() => new JiraTracker(ctx.port("http") as Http, …)));
```

The host calls the factory once every plugin has registered, once per mount and
before any `ready`; a factory that reads another deferred implementation gets it
built on demand, and two that read each other are refused at boot, naming both.
A factory that throws is the same refusal a `register` that throws is. `port`,
`engine` and `contribute` all take one. The marker is explicit because a
contribution that is itself a function is a legitimate thing to register.

## 7. Test it

Two levels, and they answer different questions.

**Unit: the class, against a scripted runner.**

```ts
it("picks up only tickets in the working status", async () => {
  const runner = scripted({ curl: { stdout: JSON.stringify(FIXTURE) } });
  const tracker = new JiraTracker(runner, { site: "…", project: "NW", workingStatusName: "In Progress" });

  expect(await tracker.workInProgress()).toEqual(["NW-412"]);
});
```

A test name is a sentence about behaviour — `refuses a second claim`, not
`test claim()`.

**Artifact: the built package, from another process.**

Unit tests import source from inside your workspace. A barrel that forgets an
export, or a `dist` nobody built, passes every one of them and is broken on the
machine that installs it. So run the thing:

```sh
node -e 'import("@acme/plugin-jira").then(m => {
  if (!m.plugin) throw new Error("no plugin export");
  console.log(m.plugin.name, Object.keys(m.plugin.configSchema));
})'
```

If you want that as a standing proof rather than a one-off, see
[Testing](testing.md) and [The gate](../development/the-gate.md) — amy holds each
of its own plugins to exactly this, with the proof expiring when the plugin
changes.

## 8. Publish it

```sh
npm publish --access public
```

Then, so people can find it:

- Add `amy-plugin` to the package's `keywords`.
- Add the `amy-plugin` topic to the repository.

That is the whole listing mechanism — see
[Publishing a package](../catalog/publishing-a-package.md).

## The failure modes, in one place

| What you did | What you will see |
| :-- | :-- |
| No `plugin` export | `imported, but exports no \`plugin\`` |
| CommonJS, or no `exports` map | `not installed — install it, or drop it from the config` |
| Threw in `register` | `failed to mount — <what you said>` |
| Two plugins mount the same port | `` the `tracker` port is already mounted by another plugin `` |
| Registered an action with no port | `` action `page-oncall`: needs the `pager` port, which nothing mounted `` |
| Config key you never declared | `` `sight` is not a setting this plugin has `` |
| State on the plugin object | The second profile in one process answers with the first one's data |
| `new Date()` in your adapter | A test that has to sleep |

## Worth reading next

- [Ports](../concepts/ports.md) — every contract, and which are not ports.
- [Plugins and the registry](../concepts/plugins.md) — every way `mount()` refuses.
- [Reference → Plugins](../reference/plugins.md) — what each shipped plugin does, as a worked example.

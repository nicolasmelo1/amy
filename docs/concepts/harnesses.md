---
title: Harnesses, the ladder and skills
description: Which agent CLI does a step, where a step goes when that one fails or hits its limit, and how a named skill answers instead.
group: How it works
order: 10
---

# Harnesses, the ladder and skills

A **harness** is one coding agent CLI reduced to the part that differs between
them: `ask(prompt, cwd, context)`, answered with the text and an account of
the run. The account says how it went (`completed`, `failed`, `rate-limited`
or `abandoned`), which harness and model ran, the tokens, and the cost when
one is known. Nothing in the port names a ticket or a review, so every
workflow asks its questions through the same thing.

`@amykit/plugin-claude`, `@amykit/plugin-codex` and
`@amykit/plugin-hermes-agent` ship, one per CLI, so amy runs on the Claude
Code, Codex and Hermes subscriptions you already pay for.

## Harnesses contribute, the relay mounts

A port has one owner, so no harness plugin mounts the `agent` port. Each one
**contributes** a harness per model tier to the `harness` collection, and
`@amykit/plugin-agent-relay` mounts `agent` over whatever was contributed.

```text
plugin-claude ─┐
plugin-codex  ─┼──▶ the `harness` collection ──▶ agent-relay ──▶ the `agent` port
plugin-hermes ─┘
```

A single-harness install goes through the same relay. Each harness also
contributes a usage reader, which is how `amy budget` shows what each
subscription has left before the ledger. Why:
[a harness shows what is left](../design/a-harness-shows-what-is-left.md).

## Writing a harness plugin

Implement `Harness`, then contribute it with `contributeTiers`, which names
each tier `harness:model` so a ladder means the same thing whichever plugin
wrote it:

```ts
import { definePlugin, type AskContext, type Harness, type HarnessReply } from "@amykit/core";
import { contributeTiers } from "@amykit/agent-kit";

class EchoHarness implements Harness {
  readonly name = "echo";
  constructor(private readonly model: string) {}

  async ask(prompt: string, _cwd: string, _context?: AskContext): Promise<HarnessReply> {
    return {
      text: prompt,
      run: { outcome: "completed", harness: this.name, model: this.model, costSource: "unknown", durationMs: 0, output: prompt },
    };
  }
}

export const plugin = definePlugin({
  name: "@you/plugin-echo",
  configSchema: {
    models: { type: "string[]", description: "the model tiers, cheapest first", default: [] },
  },
  register(registry, ctx) {
    contributeTiers(registry, { harness: "echo", models: ctx.config.models, make: (model) => new EchoHarness(model) });
  },
});
```

A real harness spawns its CLI through `ctx.runner`, so `amy stop --all` can end
it. It reports `rate-limited` only from a structured signal the CLI gives,
never by reading its error text. See [Write a plugin](../guides/write-a-plugin.md).

## The ladder

```yaml
agent:
  ladder: [claude:sonnet, claude:opus, codex:gpt-5]
  ladderByStep:
    triage: [claude:haiku]
```

Cheapest first. Naming a harness in a ladder is what mounts it, so the ladder
is where an operator says which agents they have. A name nobody contributed is
refused at boot, listing what was contributed: a typo would otherwise make the
ladder shorter than the operator thinks, and the first sign would be work
escalating for no reason. `ladderByStep` gives one step its own ladder,
because reading a ticket and writing the change are different jobs.

### After a rung does not work out

The relay does not retry blindly. Each outcome moves differently:

| Outcome | What the relay does | Why |
| :-- | :-- | :-- |
| `completed` | Stops. | It worked. |
| `failed` | Next rung in order: the next model of the same harness, then the next harness. | It may be a capability problem, so both axes are tried. |
| `rate-limited` | Skips every remaining rung of that harness. | A stronger model behind the same quota is still behind it. |
| `abandoned` | Stops. | The binary is missing, or `amy stop` killed the child, and starting a fresh one would undo the stop. |

`amy doctor` catches a missing binary before any work is touched. Every move
up the ladder is logged as `agent.handoff`, saying which axis moved.

When the whole ladder is rate-limited, the workflow's action can report that
it did not try. The engine then waits for the provider's reset without
charging an attempt. Why:
[a usage limit is not an attempt](../design/a-usage-limit-is-not-an-attempt.md).

## A run carries only what amy hands it

A harness runs apart from the operator's own setup. The Claude harness loads
the repository's settings and leaves out the user's hooks, plugins, memory and
skills. A skill a step names is lent to the run by its directory. A step marked
read-only is enforced by the harness's own sandbox, and a harness that cannot
enforce it refuses the run so the relay hands it on. Why:
[a run carries only what amy hands it](../design/a-run-carries-only-what-amy-hands-it.md).

## Skills: who does the step

A step can be handed to a named skill instead of amy asking in its own words:

```yaml
skills:
  address-threads: [/northwind-code-review, /logion]
  triage: [/logion]
```

The skill's invocation goes first and amy's instructions follow, so the answer
comes back in the same shape whoever wrote it. A key must be a step that
reaches the `agent` port; any other key is refused. A skill must be installed,
meaning a directory holding a `SKILL.md` under `~/.claude/skills`, or the mount
is refused, naming what there was to choose from.

The skill ladder says **who should do the step**. The harness ladder under it
says **where to go when the one asked could not**. Each skill is tried across
the harness ladder before the next skill gets a turn, and the log says which
axis moved: `harness`, `model` or `skill`.

## amy's own skills

amy is driven from harnesses as well as driving them. Its skills ship inside
`@amykit/cli`, so they always match the amy that ships them, and `amy skills`
installs them into each harness it finds.

<!-- amy:generated skills-index -->

| Skill | When to reach for it |
| :-- | :-- |
| `/amy` | Drive amy, the machine that walks a work ticket from the tracker's working status to a QA handoff, and turns friction it hits into a plan in the repository that friction is about. |
| `/amy-btw` | Capture something said in passing as work amy will actually do — "btw the deps in the api are stale", "also check whether that monitor is still firing" — without opening a ticket and without leaving what you are doing. |
| `/amy-groom` | Groom a feature into the brief a workflow reads before it builds — by reading the ticket and the code at its base, then asking one question at a time, section by section in the order the workflow declares them, until `amy brief check` is green. |
| `/amy-init` | Set amy up on this machine end to end — the state directory, the config, the roster, the plugins it needs installed, the credentials, the notification channel — by reading what is already here and asking only what the machine cannot answer. |
| `/amy-show-me` | Show what an amy workflow is and where its work has got to, visually — the state machine, the path one piece of work took, what is waiting on what. |
| `/amy-status` | Answer "where is my work" from the project's side rather than the machine's — what is open, what amy is working on right now, what is waiting on you, what is stuck — across every workflow at once, as a page you can keep open. |
| `/amy-workflow` | Design a new amy workflow, or change one that exists, by being interrogated one question at a time until the shape is settled — then write it as its own package. |

<!-- amy:end skills-index -->

```sh
amy skills                       # find the harnesses and ask
amy skills --all                 # every harness found, without asking
amy skills --harness claude
amy skills --dir ~/.somewhere    # a harness this does not know
```

A skill does what needs judgement: interrogating a design, reading a config,
choosing what to show. Anything a command can do stays a command, since a
skill wrapping one is a second thing to keep in step.

Changing amy's own codebase is deliberately not a shipped skill. It would sit
in front of people who installed amy to drive their work, describing a
repository they do not have.

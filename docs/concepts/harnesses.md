---
title: Harnesses, the ladder and skills
description: Which agent does a step, what happens when it runs out of quota, and how a named skill answers instead.
group: How it works
order: 8
---

# Harnesses, the ladder and skills

A **harness** is one coding agent CLI, reduced to the only thing that differs
between them:

```ts
interface Harness {
  readonly name: string;
  ask(prompt: string, cwd: string, context?: AskContext): Promise<HarnessReply>;
}
```

A prompt, a directory, and an account of what the answer cost. Nothing in it
names a ticket, a plan or a review — which is why it lives in the core, and why
a second workflow can ask its own questions through the same thing.

Three ship: `@amy/plugin-claude`, `@amy/plugin-codex`, `@amy/plugin-hermes-agent`.

## Harnesses contribute; the relay mounts

None of the three mounts the `agent` port. Each **contributes itself** to two
collections, and `@amy/plugin-agent-relay` is the only thing that mounts `agent`.

```text
plugin-claude ─┐
plugin-codex  ─┼──▶ agent / harness collections ──▶ agent-relay ──▶ the `agent` port
plugin-hermes ─┘
```

Two collections rather than one, because they are used at different levels. The
**agent** already knows what a ticket is (`triage`, `implement`,
`addressThreads`). The **harness** knows nothing and is what a second workflow
asks its own questions through (`ask`). Contributing only the first is what made
the Claude plugin one exactly one workflow could use.

Naming lives in shared code rather than in each harness plugin, because the name
is a contract: the ladder in a config file refers to it. Three plugins inventing
three conventions would make the config unlearnable.

## The ladder

```yaml
agent:
  ladder: [claude:sonnet, claude:opus, codex:gpt-5]
```

Cheapest first. Naming a harness here is also what mounts it, so the ladder is
the one place an operator says which agents they have. A name nobody contributed
is refused at boot with the list of what was contributed — a ladder with a typo
in it would quietly become shorter than the operator believes, and the first
symptom would be a ticket escalating for no reason.

### What happens after a rung does not work out

This is not a retry loop, because the two causes want **opposite** moves:

| Outcome | What the relay does | Why |
| :-- | :-- | :-- |
| `completed` | Nothing. | It worked. |
| `failed` | Next rung in order — the next model of the same harness first, then the next harness. | It might be a capability problem, so both axes get exhausted rather than one. |
| `rate-limited` | **Skips every remaining rung of that harness** and goes to the next harness. | Not a capability problem. A stronger model behind the same quota is still behind the same quota. |
| `abandoned` | Stops. | A missing binary is one cause and `amy stop` killing the child is another, and retrying the second would start a fresh child the moment the handbrake came down. |

`amy doctor` is what catches the missing binary, before any work is touched.

Every move is logged as `agent.handoff` with the axis that moved: `harness`,
`model` or `skill`.

## Skills: who should do the step

A step can be handed to a named skill instead of amy asking in its own words:

```yaml
skills:
  address-threads: [/northwind-code-review, /logion]
  triage: [/logion]
```

The invocation goes **first** and amy's own instructions follow it, because the
answer has to arrive in the same shape whoever does the work.

Only the steps an agent performs can be handed over, and a key that is not one
of them is refused rather than ignored.

### Two ladders, and they answer different questions

**The skill ladder is who should do the step.** **The harness ladder underneath
it is what to do when the one asked ran out of quota or was not up to it.**

So a skill is tried across the harnesses it needs before the next skill gets a
turn. The log says which axis moved.

### A skill named here has to be installed

Meaning a directory holding a `SKILL.md` under `~/.claude/skills`, which is
where the harness looks too. One that is not installed **fails the mount**,
naming what there was to choose from.

A ladder that quietly means less than it says is worse than one that will not
load.

## amy's own skills

amy is driven *from* harnesses as well as driving them. Its skills ship inside
`@amy/cli` — so they cannot drift out of step with the amy that ships them — and
`amy skills` installs them into each harness it finds on the machine.

<!-- amy:generated skills-index -->

| Skill | When to reach for it |
| :-- | :-- |
| `/amy` | Drive amy, the machine that walks a work ticket from the tracker's working status to a QA handoff, and turns friction it hits into a plan in the repository that friction is about. |
| `/amy-btw` | Capture something said in passing as work amy will actually do — "btw the deps in the api are stale", "also check whether that monitor is still firing" — without opening a ticket and without leaving what you are doing. |
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

Their job is **judgement** — interrogating a design, reading a config, choosing
what to show. Everything a command can do, a command does: a skill that wrapped
one would be a second thing to keep in step, and one that quietly did not load
looks exactly like one that did and had nothing to say.

Changing amy's own codebase is deliberately not one of them. A skill in front of
somebody who installed amy to drive their tickets, describing a repository they
do not have, is noise in the one place noise is expensive — the list an agent
reads when deciding what to reach for.

## Writing a harness plugin

Implement `Harness`, then contribute your tiers:

```ts
register(registry, ctx) {
  contributeTiers(registry, {
    harness: "ollama",
    models: ctx.config.models as string[],
    make: (model) => new OllamaHarness(ctx.runner, model, ctx.config),
    git: new Git(ctx.runner, { workspaceRoot: ctx.paths.workspace, defaultBranch: "main" }),
  });
}
```

`contributeTiers` adds one agent **and** one bare harness per model tier, under
one name, so a ladder means the same thing whichever level reads it. See
[Write a plugin](../build/write-a-plugin.md).

---
name: amy-develop
description: >-
  Change amy's own codebase. Use when adding a lifecycle state, an effect, an
  adapter or a gate command, or when a change to amy has to pass its gate.
  Covers the layering and its dependency rule, why the decision function must
  stay pure, the test conventions, and the handful of facts about the tracker
  and the code host that look obvious and are wrong.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [amy, development, architecture, ports-and-adapters, testing]
    related_skills: [amy]
---

# Changing amy

## The gate

Nothing is done until all five are green:

```sh
npm run build && npm test && npm run lint && sf check && sf verify
```

`sf verify` proves every enabled rule fires against a deliberately broken
fixture. Do not lint `.software-factory/mutations`: those repositories are
broken on purpose.

Four complexity findings are frozen in `.software-factory/ratchet.yaml` with a
note. Adding a key there by hand to silence a new finding is the one move that
file exists to make visible in review. Do not do it quietly.

## Layering, and the rule that holds it

```text
src/
├── domain/          # models and pure rules. Depends on nothing.
├── application/
│   ├── ports/       # the contracts
│   └── services/    # machine (pure), transition (pure), Worker
├── infrastructure/  # the adapters
└── cli/
```

**Inner layers never reach outward.** `domain` imports nothing from
`application`, `application` imports nothing from `infrastructure`.

**`plan()` in `application/services/machine.ts` is pure and must stay pure.**
It reads a record and an observation and returns a plan. It performs no I/O,
which is why the whole lifecycle is walked end to end in
`tests/application/walkthrough.test.ts` with no network, no tracker and no
agent. If a decision seems to need I/O, the I/O belongs in an effect whose
outcome is recorded, and the next look reads the record.

## Adding a lifecycle state

Four places, in order:

1. `src/domain/state.ts` — add it to `TICKET_STATES`, and to `WAITING_STATES`
   if it holds for the outside world.
2. `src/application/services/machine.ts` — a case in `plan()` delegating to a
   small `planX` function. Keep the logic out of the switch.
3. `tests/application/machine.test.ts` — a `describe` block per state, one
   assertion per predicate.
4. `tests/application/walkthrough.test.ts` — make sure a path still reaches
   `DONE`. That test throws if the machine never settles, which is what stops
   a new state becoming a dead end.

## Adding an effect

1. `src/domain/effect.ts` — a variant on `Effect`.
2. `src/application/services/Worker.ts` — a case in `execute()` calling a port.
3. If it produces something the machine has to remember, a field on
   `EffectOutcomes` in `transition.ts` and a line in `applyOutcomes`.

The machine only ever *describes* an effect. It never performs one.

## Adding an adapter

Define the contract in `application/ports/`, implement it in
`infrastructure/`, and reach the outside world only through `CommandRunner` or
`GraphQLClient`. That is what lets every adapter be tested against a scripted
answer instead of the real `gh`, `claude`, `git` or API:

```ts
const runner = new ScriptedRunner([
  { match: whenArgsInclude("graphql"), result: { stdout: JSON.stringify(response) } },
]);
```

Prefer a fixture shaped from a **real** response. `GitHubCodeHost.test.ts` uses
one, which is how the stale-review case below was caught.

## Test conventions

- Do not edit an existing test file to make a change pass. Add cases, or add a
  file. If an existing assertion has to change, the behaviour genuinely
  changed, and the commit should say so.
- A new check is not finished until something proves it fires. Revert the fix
  and watch the test go red before trusting it.
- Name the test after the behaviour, not the function.

## Facts that look obvious and are wrong

Each of these is enforced by a test. Do not "simplify" one away.

- **The working status is matched by name, never by category.** The tracker
  files In Review, In QA, Ready To Release and Triage Review under the same
  category as In Progress.
- **Ask whether a reviewer has reviewed *the current head*, not whether they
  have reviewed.** The bot posts a review even when it found nothing, and a
  human's requested-changes can sit on a commit from three pushes ago.
- **The bot answers to three logins**, depending on which API you ask.
  `src/domain/review.ts` is the only place that decides what counts.
- **Review load is counted across every repository.** Counting one sends every
  review to whoever happens to be quiet in that one.
- **The branch name comes from the tracker.** It owns the slug, and a locally
  derived branch breaks the tracker's automatic pull request linking.
- **An implementation is dated against the gate.** Without that, a red gate
  bounces to the agent, finds the previous successful attempt still recorded,
  and returns to the gate forever.
- **The default branch is not always `main`.** It is configured per install
  for a reason.

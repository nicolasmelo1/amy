---
name: amy-develop
description: >-
  Change amy's own codebase. Use when starting a plan from plans/, adding a
  state, an action, a port or an adapter, or when a change to amy has to pass
  its gate. Points at where the rules already live and adds the one step they
  do not cover: a plan is made ready before the work on it starts.
---

# Changing amy

Read the rules where they are kept, not here:

- [`CONTRIBUTING.md`](../../../CONTRIBUTING.md) — the architectural rule, the
  conventions, how a plan is written.
- [`docs/development/the-gate.md`](../../../docs/development/the-gate.md) —
  `npm run gate`, and why every rule is proven to fire.
- [`docs/mechanisms.yaml`](../../../docs/mechanisms.yaml) — what a change can
  cross, and so what a plan has to answer.

## Starting a plan

1. **Make it ready against today's code.**

   ```sh
   sf ready plans/<plan>.md
   ```

   `✗` is a fact that no longer holds — a cited file or test that is gone, a
   `symbol:` the file no longer has, a line number. Fix the line: cite the
   file in `ref:` and name what you mean in `symbol:`. `~` is a file the plan
   cites that changed since its `base:`, or no `base:` at all. Re-read the
   sources it names and correct what moved. A decision source changes only if
   the person who made it says so.

2. **Stamp it, in its own commit, on its own branch or before the work's:**

   ```sh
   sf ready plans/<plan>.md --stamp
   ```

   It writes `base:` at HEAD and is refused while anything is broken.

3. **Build it.** The plan does not change while the work does. Something
   discovered that the plan did not say is a question for the person, and an
   answer becomes a `kind: decision` source.

4. **Deliver it.** Each criterion gets `done: true` with a proof that runs,
   `deviations:` says what changed from the plan, and the file moves to
   `docs/design/`.

## Before opening the pull request

- `npm run gate` is green, with the `sf` the lock names
  (`./scripts/setup-dev.sh` installs it).
- Every mechanism the plan's `crosses` answers `works` has the test its `proof`
  names. That list is what the reviewer checks against
  ([`.github/copilot-instructions.md`](../../../.github/copilot-instructions.md)).
- A gate whose evidence went stale is re-run and re-sealed, never hand-edited:
  `./.software-factory/evidence/<gate>-scenario.sh`, then `sf seal <gate>`.

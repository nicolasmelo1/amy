# @amy/plugin-codex

The `codex` CLI as an agent.

Contributes one agent per model tier to the collection
`@amy/plugin-agent-relay` reads. It does not mount the `agent` port itself,
which is what lets it sit beside the other harnesses.

Mounted only when the ladder names it, so a machine that never installed
codex is never asked about it.

## It reads the event stream, not the console

`exec --json` prints one JSON object per line. The answer arrives as the last
`agent_message`, and the account arrives on `turn.completed`.

A line that does not parse is skipped rather than fatal. The shape of this
stream has changed more than once upstream, and a stray line should cost that
line, not the whole run.

`--skip-git-repo-check` is passed because amy always runs in a checkout it
prepared itself. Without it, an untrusted-directory prompt would hang a run
nobody is watching.

## The token convention, which is the opposite of Hermes

`input_tokens` here is the **total** input, cache included. From a real run:

```json
{"input_tokens":17571,"cached_input_tokens":11008,"output_tokens":5}
```

So the uncached input is `17571 - 11008 = 6563`. Mapping the field straight
across would count those 11008 tokens twice and inflate every cost and every
budget window.

Hermes spells the same field the other way round. That is why the two parsers
are not shared, and why both are tested against a captured envelope rather
than an invented one.

## What it can and cannot say about cost

Codex reports tokens and never a price, so cost here is always **computed**
from the vendored table in `@amy/model-specs`, or absent. A model that is not
in the table gives `costSource: "unknown"` and no number, because a cost
nobody measured is not a cost.

No usage event at all gives **absent** tokens rather than zero. Zero is a
number somebody would then add up.

## What it cannot distinguish

The stream carries no quota status, so a rate limit reads as `failed`. The
relay's policy sends a failure along both axes, so another harness is still
reached, one rung later than a claude throttle would be.

## Settings

| Setting | Default | |
| :-- | :-- | :-- |
| `model` | `""` | passed as `--model`. Empty leaves the choice to codex |
| `models` | `[]` | the tiers to contribute. Normally derived from the ladder |
| `defaultBranch` | `main` | the branch new work is cut from |
| `reviewerHints` | `{}` | guidance appended when answering a given reviewer |
| `timeoutMs` | 30 min | how long one call may run |

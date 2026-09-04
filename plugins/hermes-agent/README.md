# @amy/plugin-hermes-agent

Hermes as an agent.

Contributes one agent per model tier to the collection
`@amy/plugin-agent-relay` reads, rather than mounting the `agent` port itself.
Mounted only when the ladder names it.

Not to be confused with `@amy/plugin-notify-hermes`, which uses Hermes to
reach **you**. This one uses it to do the work.

## It asks for the account in a file

`-z` prints only the final response, and `--usage-file` writes the account
beside it. The report is written **even when the run fails**, which is the
nicest property of the three harnesses: a failed run still says what it spent,
so nothing is silently free.

The file is removed once it has been read. A run every few minutes would
otherwise leave one behind each time.

## The token convention, which is the opposite of codex

`input_tokens` here **excludes** what was served from cache. From a real
report:

```json
{"input_tokens":7466,"output_tokens":5,"cache_read_tokens":8704,"total_tokens":16175}
```

`7466 + 8704 + 5 = 16175`, its own total. Subtracting the cache here, the way
the codex mapping has to, would lose 8704 tokens off every budget window.

## It is the reason `costSource` exists

Hermes reports `cost_status` alongside the number, so it says when its own
figure is an estimate. Three cases, and they are not the same claim:

- `cost_status: "included"` means a subscription covered the run. Zero is the
  **right answer**, not a missing one, and conflating the two would make a
  real spend look free.
- a positive `estimated_cost_usd` is recorded as `computed`, not `reported`,
  because Hermes calls it an estimate itself. Presenting somebody else's
  estimate as a measurement is what `costSource` exists to stop.
- neither, and no model in the vendored table, gives `unknown` and no number.

The model recorded is the one the report **names**, not the one that was
asked for, since Hermes may fall back.

## What it cannot distinguish

The report says plainly whether a run completed or failed, which beats an exit
code, but it carries no quota status. So a rate limit reads as `failed`. No
report at all plus a bad exit reads as `abandoned`, which is a missing binary,
and the relay deliberately stops there rather than trying elsewhere.

## Settings

| Setting | Default | |
| :-- | :-- | :-- |
| `model` | `""` | passed as `-m`, the flag hermes accepts |
| `models` | `[]` | the tiers to contribute. Normally derived from the ladder |
| `defaultBranch` | `main` | the branch new work is cut from |
| `reviewerHints` | `{}` | guidance appended when answering a given reviewer |
| `timeoutMs` | 30 min | how long one call may run |

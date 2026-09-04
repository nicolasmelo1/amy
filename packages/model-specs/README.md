# @amy/model-specs

What each model costs per token, vendored and versioned.

Its own package because pricing is neither kernel nor domain: the core does
not care what a token costs and a workflow does not either. The agent plugins
read it to fill in a cost their harness did not report, and the budget reads
it to decide when to stop.

## Vendored on purpose

`specs.json` is committed, and nothing on the path that decides spending
touches the network. The same version of amy always works out the same number.

The table names its own source, because a price table nobody can check is a
number nobody should trust.

## A model with no price is left out

Absent is a real answer. It produces `costSource: "unknown"`, the cost is
omitted rather than guessed, and the token ceiling still stops the work. A
guessed rate would be spent against a dollar ceiling as though it had been
measured.

## Refreshing is not replacing

```sh
amy models show
amy models refresh --dry-run    # what would change
amy models refresh              # writes .amy/model-specs.json
```

models.dev publishes one rate per token kind. It does **not** publish
long-context tiering, so a refresh keeps the `thresholdTokens` and
`aboveThreshold` already in the table. Overwriting them would make a
200,000-token request look cheaper than it is, and that is the one direction a
cost estimate must never be wrong in.

The refresh writes a local override rather than the vendored file, because in
a published install the vendored file lives inside `node_modules` and
rewriting somebody's dependency in place is not a refresh.

## Two things about the arithmetic that are easy to get wrong

Both taken from [CodexBar](https://github.com/steipete/CodexBar), which is
also where the vendored numbers come from.

**The threshold is measured on the whole input side** — input plus cache reads
plus cache writes — not on input alone. And crossing it **re-rates the entire
request**, not merely the excess.

**A one-hour cache write is billed at twice the input rate**, which none of
the four rate fields expresses on its own.

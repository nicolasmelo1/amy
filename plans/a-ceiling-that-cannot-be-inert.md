# A ceiling that cannot be inert

`packages/model-specs/specs.json` prices `claude-opus-4-5`, `4-6`, `4-7` and
`claude-sonnet-4-5`. It has no entry for the Claude 5 family. `specFor`
returns `undefined` for a model it does not know
(`packages/model-specs/src/specs.ts:90`), the run is recorded with no
`costUsd` — *"Nobody knows. `costUsd` is absent, and that is the honest
answer"* (`core/src/agent-run.ts:52`) — and `spend.costUsd` adds nothing
(`core/src/budget.ts:57`).

Every part of that is correct on its own, and together they produce the one
failure a budget must not have: an install running a current model with
`budget.perWeek.costUsd: 150` set has no dollar ceiling at all. It is not
loose, it is inert. The token ceiling beside it still fires, which is what
makes this quiet — the machine does stop sometimes, just never for the reason
that was written down.

The table lagging is not a bug to fix once. A price table always lags, and
`amy models refresh` exists because of it. What has to change is that the
ceiling knows.

## What changes

Two things, and the second is the one that lasts.

The table gains the current models, through `amy models refresh` against
models.dev and committed — `packages/model-specs/specs.json` is under
`L2.GENERATED_FILES_ARE_LOCKED`, so it moves visibly or not at all.

And a `costUsd` ceiling is refused at boot when a rung in any ladder names a
model the table cannot price. The relay already refuses *"a budget it cannot
mean"* (`assertion:relay.refuses_a_budget_it_cannot_mean_at_boot`); this is
the same sentence about a different half of the same thing, and it says which
model and which rung, so the answer is either `amy models refresh` or a
ceiling in tokens.

`amy budget` says the same thing while it is running: a window with a dollar
ceiling and unpriced runs in it reports how many, rather than reporting a
spend that is arithmetically true and practically a lie.

## The gate

`plugin-agent-relay`, extended — it owns the ceiling and its activation covers
`packages/agent-kit/src/**`. Add:

- `relay.refuses_a_dollar_ceiling_it_cannot_price`
- `relay.names_the_model_that_has_no_price`
- `relay.a_token_ceiling_needs_no_price_table`

## Acceptance criteria

- [ ] The price table prices every model the shipped template names
      (proof: test:packages/model-specs/tests/specs.test.ts)
- [ ] A `costUsd` ceiling over an unpriced rung is refused at boot
      (proof: assertion:relay.refuses_a_dollar_ceiling_it_cannot_price)
- [ ] The refusal names the model and the rung
      (proof: assertion:relay.names_the_model_that_has_no_price)
- [ ] A ceiling in tokens alone boots against an unpriced model
      (proof: assertion:relay.a_token_ceiling_needs_no_price_table)
- [ ] `amy budget` reports how many runs in the window carry no price
      (proof: test:packages/cli/tests/budget.test.ts)
- [ ] `amy models refresh` keeps what models.dev does not carry
      (proof: test:packages/model-specs/tests/refresh.test.ts)

**Exit condition:** no install can hold a dollar ceiling that cannot stop
anything — either the model is priced, or the machine refused to start.

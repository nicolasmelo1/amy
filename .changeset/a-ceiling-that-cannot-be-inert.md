---
"@amykit/model-specs": minor
"@amykit/plugin-agent-relay": minor
"@amykit/core": minor
"@amykit/cli": minor
---

Refuse a dollar ceiling the price table cannot price, and price the Claude 5
family.

`specs.json` had no row for the Claude 5 family, so `specFor` returned nothing,
every run was recorded with no `costUsd`, and an install with
`budget.perWeek.costUsd: 150` set had no dollar ceiling at all — not loose,
inert. The token ceiling beside it still fired, which is what made it quiet.

The table now prices `claude-opus-5`, `claude-sonnet-5`, `claude-opus-4-8`,
`claude-sonnet-4-6` and `claude-fable-5-1` at rates taken from models.dev, and
declares the short names a harness CLI accepts (`opus`, `sonnet`, `haiku`,
`fable`) so a ladder written in them can be recognised. A refresh keeps both,
because models.dev carries neither long-context tiering nor aliases.

A price table always lags, so the lasting half is that the ceiling knows: the
relay refuses at boot when a rung in any ladder — including a step's own —
names a model the table cannot price, naming the model and the rung, so the
answer is `amy models refresh` or a ceiling in tokens. A ceiling in tokens over
the same ladder boots untouched.

`amy budget` now reports how many runs in a window carry no price, rather than
a dollar figure that is arithmetically true and practically a lie.

**Breaking for one config shape:** `ladder: [claude]` — a single-model install
naming no model — is now refused under a `costUsd` ceiling, because there is no
id to price it by. Name the model (`claude:sonnet`) or set the ceiling in
tokens.

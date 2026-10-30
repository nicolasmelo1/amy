---
"@amykit/core": minor
---

**Waiting is not trying.**

The core now records `looks` separately from `attempts`: waits and logistical
acts are visible without consuming an attempt ceiling. `looksIn` and
`attemptsIn` make the distinction explicit, an `act` may be marked
`{ attempt: false }`, and an action result can return `notATry` to refund a
pre-charged attempt and delay the next look.

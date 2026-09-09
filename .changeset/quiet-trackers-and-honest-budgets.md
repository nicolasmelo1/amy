---
"@amykit/plugin-linear": patch
"@amykit/cli": patch
"@amykit/core": patch
---

Stop commenting machine notices on the tracker, and stop counting cache reads
against the token ceiling.

Two defects that both made the machine lie to its operator, found on the same
day on the same install.

**`notify.tracker: false` was dead configuration.** `plugin-linear` contributed
its notification channel unconditionally and never read the setting, so every
engine notice was commented on the Linear ticket — under the operator's own
name, because amy authenticates with a key issued to a person, and with no
prefix or marker because the channel posted the raw announcement text. `REVV-7716
is moving again in DONE after 2 failed attempt(s)` reached a real ticket and a
colleague replied to it asking what it meant. The channel is now contributed
only when asked for, the default is off, and what it writes says a machine
wrote it on the first line.

**One agent run could park the machine for five hours.** The token ceiling
summed `input + output + cacheRead + cacheWrite`. A single implement run
reported `input: 44, output: 17394, cacheRead: 1839757, cacheWrite: 92769` —
1,949,964 against a 2,000,000 per-five-hours ceiling, from a run that cost
$0.91 against a $20 ceiling in the same window. A cache read is the saving,
not the spend, so the better prompt caching worked the sooner the machine
locked itself out. The ceiling now counts billable tokens; `costUsd` remains
the ceiling that knows what cache is worth.

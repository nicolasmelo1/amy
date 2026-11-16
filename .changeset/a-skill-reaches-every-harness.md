---
"@amykit/core": patch
"@amykit/agent-kit": patch
"@amykit/plugin-agent-relay": patch
"@amykit/plugin-codex": minor
"@amykit/plugin-hermes-agent": minor
---

**A skill reaches every harness.**

A step's skill was lent only to Claude; Codex received `/name` with nothing
behind it and Hermes refused the turn. Codex now gets the skill as a link
under the fresh `CODEX_HOME` the run already had, Hermes passes `-s <name>`
with amy's skill root named in the profile's `skills.external_dirs`, and both
declare `lendsSkill`. The relay never sends a skill's name to a rung it did
not hand the skill to, a ladder that could reach such a harness is refused at
boot, and the conformance suite fails a harness that answers a skill turn
without declaring it.

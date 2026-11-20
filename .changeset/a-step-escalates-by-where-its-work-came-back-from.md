---
"@amykit/core": minor
"@amykit/agent-kit": minor
"@amykit/cli": patch
"@amykit/plugin-command-gate": patch
---

**An escalation knows where its work came back from.** `@amykit/core` gains
`escalation.ts`: every origin of new work is configured the same way, with a
named scale of rounds in `config.yaml` and a level that applies from a number
of findings on, and an origin's rounds climb one rung and never come back down.
A gate answers how many checks were red. A config field may be `oneOf`, typed
as the union of the keys a dotted group declares and refused when it names
anything else. A diagram marks a state `verified` or `sendsBack`, and a mount
refuses one whose marks disagree with the workflow's own declarations.
`@amykit/agent-kit` asks a step's rung directly instead of always starting at
the first, tells the next rung why a completed reply was refused, and gives
`judgeStep` and `implementStep` a verify of their own: an answer with no
readable JSON climbs, and an implementing run that changes nothing and says
`NOTHING_TO_CHANGE` completes with its reason instead of climbing to a stronger
model.

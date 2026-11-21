---
"@amykit/core": minor
"@amykit/agent-kit": minor
"@amykit/cli": patch
"@amykit/plugin-command-gate": patch
"@amykit/workflow-ticket-to-qa": minor
---

**An escalation knows where its work came back from.** `@amykit/core` gains
`escalation.ts`: every origin of new work is configured the same way, with a
named scale of rounds in `config.yaml` and a level that applies from a number
of findings on. Rounds are counted per origin from the rung the work reached,
so a round buys one rung and never several, and a rung never comes down when the
next round finds less. A gate answers how many checks were red. A config field
may be `oneOf`, typed as the union of the keys a dotted group declares and
refused when it names anything else. A diagram marks a state `verified` or
`sendsBack`, and a mount refuses one whose marks disagree with the workflow's
own declarations.

`@amykit/agent-kit` asks a step's rung directly instead of always starting at
the first, and tells the next rung why a completed reply was refused. No step
verifies by default: `judgeStep` and `implementStep` take the reply they are
given, and a step that wants a climb declares its own `verify`, which is the one
that decides. A run that ended without changing a file is an answer on the rung
that gave it, with the agent's own words as the reason.

The ticket-to-QA workflow keeps one place that changes code. A reviewer's
thread, an automated thread, failing checks and the owner's word all send the
work to `IMPLEMENTING`, and a change reaches the remote once per round through
publishing, after the gate has run on it. What a round found is counted against
the origin that sent it back, an origin that spends its ladder escalates to the
owner, and the two attempt ceilings it used to carry are gone.

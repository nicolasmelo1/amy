---
"@amykit/core": minor
"@amykit/workflow-ticket-to-qa": patch
---

**A ticket reads the brief its project judged.**

`briefOf` resolves the brief a unit is worked against: the one stored under
the unit's own id first, the tracker's `briefId` after. Triage, self-review,
the question triage appends and a project's GROOMED gate read that one brief,
so a unit groomed for itself is worked against what the gate judged.

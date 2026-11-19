---
"@amykit/cli": patch
"@amykit/core": patch
"@amykit/workflow-ticket-to-qa": patch
---

**The work phase reads its project's brief.**

A project's phase folders now decide which phases run, so a workflow that
declares its own brief phase absent can still be the work phase of a project
that grooms one. Triage records the brief its prompt was built from and
appends its question there, a unit's brief is read under its work id even when
the ticket spans repositories, prompts name the brief as the one the ticket is
worked against, and `briefOf` names the id whose read failed.

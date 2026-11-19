---
"@amykit/workflow-ticket-to-qa": patch
---

**The review is handed the unit's work id.**

A project's phase record is named for the call (`PROJ-1239/WORKFLOW#1`), and
the self-review lane was reading the brief under that id, which a brief store
refuses for its slash. The lane now receives the unit's work id and resolves
the brief there, so a project's review reads what triage read and labels it
the brief the ticket is worked against.

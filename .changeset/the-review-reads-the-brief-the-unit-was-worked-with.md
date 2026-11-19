---
"@amykit/workflow-ticket-to-qa": patch
---

**The review and an in-flight question read the brief the unit was worked with.**

The self-review lane resolves the brief under the unit's work id, not the
ticket's, so a ticket worked in one of several repositories reviews against
the same brief triage read and labels it as its own. A record triaged before
triage kept the brief it read appends its question to the brief the current
look resolved, instead of appending nowhere.

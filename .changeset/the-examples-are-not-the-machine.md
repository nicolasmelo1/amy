---
"@amykit/workflow-errand": patch
"@amykit/workflow-feature-grooming": patch
"@amykit/workflow-note-to-plan": patch
"@amykit/workflow-pull-request": patch
"@amykit/workflow-ticket-to-qa": patch
"@amykit/cli": patch
---

**The examples are not the machine.**

The five workflows amy ships moved from `packages/` to `examples/`, under the
same names and versions, so an install that names one updates without
noticing. `packages/` now holds amy itself and what it needs to run. Each
example opens its README with what it is for, written for somebody who has
never seen amy, above the reference generated from the package. A fork of a
version released after the move is read from `examples/`, and a fork taken
before it follows the release to its new directory on `amy update` instead of
stopping the update.

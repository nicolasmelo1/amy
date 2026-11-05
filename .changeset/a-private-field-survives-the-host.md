---
"@amykit/core": patch
---

`declaredWorkflowsOnly` keeps every member of the plugin and of the registry
on its own object. It used to wrap both in a prototype copy, so a class
plugin whose getter or method reads a `#private` field threw a `TypeError` on
its own name, and boot stopped before mount could report it.

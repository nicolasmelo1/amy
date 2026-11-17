---
"@amykit/core": patch
"@amykit/cli": patch
"@amykit/plugin-claude": patch
"@amykit/plugin-file-worktree": patch
"@amykit/workflow-setup": patch
---

**The gate notices code nothing reaches, and code written twice.** `tsc` now
runs with `noUnusedLocals` and `noUnusedParameters`, and the gate reads both
detectors through one step: `knip --production`, where a test no longer counts
as a caller, and `jscpd` over packages, plugins and examples. What the tree
already carried is frozen by name in a ratchet with a date it comes due, so the
next unused export or copied block fails instead of joining the pile. The
unused parameters and the one unread private field this change exposed are
gone.

---
"@amy/cli": patch
---

The release workflow calls the changesets action by the names it actually
has. Its inputs were renamed in v2 and the old ones are a hard error, so the
first run on main stopped before doing anything — which is the failure mode
to want.

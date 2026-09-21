---
"@amykit/cli": patch
---

`findPrivateReferences` reads a tree against a policy of hashed terms, so the repository gate can refuse a private name — standing alone or glued into a longer identifier — without the list of forbidden names being published alongside the check that hides them.

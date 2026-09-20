---
"@amykit/cli": patch
---

`amy doctor` and `amy plugin list` resolve a workflow of your own the same way mounting does, so `amy plugin list` no longer reports a directory written by `amy workflow new` as `FAIL`, and doctor validates its settings against the schema it declares.

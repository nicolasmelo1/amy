---
"@amykit/plugin-linear": patch
---

A ticket or feature that is not in Linear answers `null` again instead of throwing. `issue(id:)` is non-null in Linear's schema, so a missing issue never came back as `null`: it came back as the error `Entity not found: Issue`, and `get` and `getFeature` threw it. That one error now reads as "gone"; every other error is still a failure.

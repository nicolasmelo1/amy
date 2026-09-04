---
"@amy/cli": patch
---

The release workflow stays dormant until `AMY_RELEASE` is set.

The first release is deliberately later, and an unarmed release job failed on
every push to main: GitHub refuses to let Actions open a pull request unless
that is switched on, and there is no npm token behind it yet either. Both are
real preconditions, and neither is a reason for main to be red in the
meantime.

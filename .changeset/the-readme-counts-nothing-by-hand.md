---
"@amykit/cli": patch
---

**The README now derives its mutable facts from the code and policy that own them.**

The published command declares its Node requirement to npm. The README's Node
badge, command table and factory counts are generated with the rest of the
documentation, so `npm run docs:check` names the README when one falls behind.

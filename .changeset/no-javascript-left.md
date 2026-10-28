---
"@amykit/cli": patch
---

The mutation fixtures `amy workflow new` writes beside a workflow are TypeScript now, the same as the scaffold they guard. Two of the three were still `index.js`, so a workflow written in TypeScript proved its guardrails against a file in a language it does not use. The rules read both, so `sf verify` in an existing workflow is unaffected.

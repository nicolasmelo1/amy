---
"@amykit/core": patch
"@amykit/cli": patch
"@amykit/plugin-prove": patch
---

The examples in the docs, the tests and the prove plugin's help name tickets
`PROJ-`, the placeholder the rest of the suite already used. A private term
can now be denied as a whole word, so a three-letter key is caught in
`XYZ-12` without also firing on every identifier that contains those letters.

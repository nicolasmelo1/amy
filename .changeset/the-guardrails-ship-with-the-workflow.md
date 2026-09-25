---
"@amykit/cli": minor
---

`amy workflow new` now writes a `.software-factory/` beside the scaffold: three repo-local rules that `sf check` in the workflow's directory enforces — no `checkout -B`, which loses a commit that was never pushed; no fold reading `.state` off the record the engine already moved (TypeScript only, since `sf` does not parse JavaScript); and no `.every(` that does not say what an empty collection means — with one mutation fixture each, so `sf verify` there proves every rule still fires. amy does not install `sf`, and `sf` learns nothing about amy: they are ordinary local rules.

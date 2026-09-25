---
"@amykit/cli": minor
---

`amy workflow new` now writes TypeScript: `index.ts` typed against `@amykit/core`, run unbuilt by Node 22.18 or later from `~/.amy/workflows`, with a `tsconfig.json` and `build`/`typecheck` scripts that compile `dist/` for publishing, since Node refuses TypeScript under `node_modules`; the suite is `index.test.ts`. A local workflow that is still `index.js` keeps resolving. It also writes a `.software-factory/` beside the scaffold: three repo-local rules that `sf check` in the workflow's directory enforces — no `checkout -B`, which loses a commit that was never pushed; no fold reading `.state` off the record the engine already moved; and no `.every(` that does not say what an empty collection means — with one mutation fixture each, so `sf verify` there proves every rule still fires. amy does not install `sf`, and `sf` learns nothing about amy: they are ordinary local rules.

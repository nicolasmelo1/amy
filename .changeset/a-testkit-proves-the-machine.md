---
"@amykit/workflow-testkit": minor
"@amykit/cli": minor
---

`@amykit/workflow-testkit` is new: `conforms(workflow, { runner, runtime, worlds })` registers the machine-shaped suite every workflow needs and nobody writes — every state reached and left, every planned action handled and surviving the call, no wait counted as a try, no decision made by `[].every(...)`, and no giving-up state without an honest way out — as ordinary tests in whichever runner it is handed, driven against worlds the author supplies. `amy workflow new` now writes that suite beside the scaffold as `index.test.js`, with `npm test` and the kit as a dev dependency, and the scaffold's `index.js` exports its `workflow` and a `runtime()` factory beside the plugin.

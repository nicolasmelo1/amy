---
"@amykit/core": patch
---

**What the core marks a value with, every copy of the core can read.** An install always holds several copies of the core: the CLI's own, the plugins root's, and whatever a project's phase folder resolves from its own `node_modules`. 0.7.0 marked a workflow's port need and an operation's declared failure with local symbols, a different key in every copy. So no project whose phase asks for a port could mount ("Cannot destructure property 'optional' of 'need[PORT_NEED]'"), and a plugin's declared failure was answered as an internal error. Both are now registered symbols. `packages/core/tests/two-copies.test.ts` runs the core against a second copy of itself, the `project-phases` gate mounts a phase that imports its own core, and `L0.THE_CORE_MARKS_WITH_REGISTERED_SYMBOLS` refuses a local symbol in the core.

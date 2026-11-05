---
"@amykit/cli": patch
---

`amy update`, and the rollback it runs when a move fails, install into the
plugins root with `--install-links`, the way `amy add` does. Before, they
installed without it, so updating any other package could turn a workflow
copied in from a path back into a link. A linked workflow's `@amykit/core`
import resolves from outside the plugins root, and the workflow failed to load.

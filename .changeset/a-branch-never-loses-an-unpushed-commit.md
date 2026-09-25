---
"@amykit/core": patch
---

Preparing a branch no longer erases a commit the machine made and could not push. `Git.prepareBranch` used `checkout -B`, which reset an existing local branch onto the remote branch or the base, so a commit whose push had failed was gone at the next look with nothing to say it existed. A branch that does not exist locally is still created from the remote branch, or from the base when the remote has none. One the remote is ahead of is fast-forwarded. One that holds commits the remote lacks is kept as it is. One that diverged from its remote is refused, and the error names the commits only the local side holds. `Git.commitAndPush` now also pushes such a commit when the tree is clean, and returns true when it does.

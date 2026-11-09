---
---

The test suite clears every `GIT_*` variable before any test runs, so a commit made from a `git worktree` no longer lets the tests' temporary repositories write into the real one. Tests only; nothing published changes.

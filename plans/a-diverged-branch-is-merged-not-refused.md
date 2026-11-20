---
base: f7c921d26a01f467d6a6e7ac1cdb484bac55f919
sources:
  - { id: S1, kind: friction, said: "2026-11-19: somebody updated a private project's pull request on the forge while amy held an unpushed local commit; every later look refused the diverged branch until the owner merged by hand" }
  - { id: S2, kind: code, ref: "packages/core/src/git.ts", symbol: "onBranch", said: "a local branch that has diverged from its remote is refused, naming what only the local side holds; every retry refuses the same way" }
  - { id: S3, kind: code, ref: "packages/core/src/git.ts", symbol: "pushIn", said: "a push the remote refuses as non-fast-forward is rethrown naming the branch, telling the caller to bring it forward first" }
  - { id: S4, kind: reference, ref: "docs/design/nothing-is-lost-and-nothing-waits-forever.md", said: "a move never loses a commit: the branch only moves forward" }
  - { id: S5, kind: reference, ref: "plans/a-failure-says-what-is-left.md", said: "NeedsPerson is given up on its first failure and announced with its message and amy look <id>" }
  - { id: S6, kind: decision, said: "both sides are work: the remote is merged into the local branch with a merge commit, never rebased or force-pushed, so the next push is a fast-forward. Decided 2026-11-19, in the private project's fork" }
  - { id: S7, kind: decision, said: "a conflicting merge is aborted and thrown as NeedsPerson naming the conflicted files, the local-only commits, and both ways out: merge by hand, or git reset --keep onto the remote. Decided 2026-11-19, in the private project's fork" }
  - { id: S8, kind: decision, said: "a diverged branch whose tree has uncommitted changes is not merged: it is thrown as NeedsPerson naming the files. Decided 2026-11-19, in the private project's fork" }
touches:
  - packages/core/src/git.ts
  - packages/core/tests/branch.test.ts
criteria:
  - { id: A1, statement: "a diverged local branch in a clean tree gets a merge commit of its remote; both heads are then its ancestors, the remote is unchanged, and the next push is a fast-forward", proof: "deferred:test:packages/core/tests/branch.test.ts", sources: [S1, S2, S4, S6] }
  - { id: A2, statement: "a merge that conflicts is aborted, the local branch and the tree are as they were before it, and NeedsPerson is thrown naming every conflicted file, the local-only commits, and both commands", proof: "deferred:test:packages/core/tests/branch.test.ts", sources: [S5, S7] }
  - { id: A3, statement: "a diverged branch whose tree holds uncommitted changes is neither merged nor reset; NeedsPerson is thrown naming the changed files", proof: "deferred:test:packages/core/tests/branch.test.ts", sources: [S5, S8] }
  - { id: A4, statement: "a push the remote refuses as non-fast-forward fetches, joins as A1 says, and pushes once more; a second refusal throws as today", proof: "deferred:test:packages/core/tests/branch.test.ts", sources: [S3, S6] }
  - { id: A5, statement: "a branch behind its remote still fast-forwards and one ahead of it is still kept, with no merge commit in either", proof: "deferred:test:packages/core/tests/branch.test.ts", sources: [S2, S4] }
crosses:
  - { mechanism: checkouts-and-leases, answer: works, proof: "deferred:A1, A2, A3; no path rewrites or drops a commit on either side" }
guarantee:
  - { holds: "joining a diverged branch never loses a commit from either side and never rewrites the remote", not_against: "a person force-pushing the remote branch between the fetch and the push" }
  - { holds: "a conflict reaches the owner on the first look, with the files and what to run", not_against: "a merge git finishes cleanly that is still wrong in meaning: the gate is what reads that" }
failures:
  - { step: join, when: "the merge conflicts", goes_to: "aborted, and NeedsPerson naming the files and both commands" }
  - { step: join, when: "the tree has uncommitted changes", goes_to: "NeedsPerson naming the files; nothing is merged" }
  - { step: push, when: "the remote refuses again after a join", goes_to: "thrown naming the branch, as today, and the engine retries" }
cut:
  - "rebasing the local commits onto the remote: refused (S6), it rewrites commits the remote never saw as they were"
  - "resolving a conflict with an agent: a later plan, if friction asks for it"
exit: "a pull request updated on the forge while amy held a local commit is merged and pushed on the next look, and a conflict reaches the owner at once naming the files"
---

# A diverged branch is merged, not refused

When somebody pushes to the work's branch while amy holds a commit it has not
pushed, the branch diverges and every look refuses it. Both sides are work, so
they are merged, and a conflict goes to the owner on the first try instead of
after every retry.

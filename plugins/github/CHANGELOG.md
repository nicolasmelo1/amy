# @amykit/plugin-github

## 0.2.1

### Patch Changes

- @amykit/core@0.2.1

## 0.2.0

### Minor Changes

- 616f7e6: A pull request carries its URL, an errand opens its own as a draft, and the
  tests are type-checked.
  
  `PullRequestView` gains `url`, and `OpenPullRequestRequest` gains `draft`.
  The errand workflow opens as a draft — nobody asked for that work at the
  moment it landed, and work somebody is waiting on is not a draft — and
  announces the link rather than the number, because that announcement is read
  on a phone more often than anywhere else and a number is a thing you have to
  go and look up.
  
  Adding a required field is what turned up the rest: **nothing type-checked the
  test files.** `tsc --build` compiles `src` only, and vitest strips types
  without checking them, so a test could name a field that does not exist and
  stay green. `npm run typecheck` now covers them, in the gate and in CI.
  
  It found 45 errors on the first run. Most were harmless drift, three were not:
  
  - The ticket workflow's walkthrough — the most important test here — typed its
    effects parameter off `effectsOf`, **a name that does not exist**. TypeScript
    never saw it because the reference was in type position and esbuild strips
    those, so the whole `switch` over the workflow's effects was unchecked.
    Adding an effect would not have failed it.
  - `@amykit/plugin-agent-relay`'s doubles returned `{ kind: "clear" }` for a
    `TriageOutcome` that has been `{ clear, questions, at }` for a while, and a
    `NamedAgent` with no `using`, which is the method the skill ladder calls.
  - Six engine test builders typed their overrides as the engine's own deps
    rather than the ticket fixture's, so every option they accepted was one the
    type said could not be passed.

### Patch Changes

- Updated dependencies [b53de08]
- Updated dependencies [eb5214d]
- Updated dependencies [f9944f6]
- Updated dependencies [76692e1]
- Updated dependencies [353d361]
- Updated dependencies [2b6bde3]
- Updated dependencies [a97c34d]
- Updated dependencies [0b5e3d8]
- Updated dependencies [616f7e6]
  - @amykit/core@0.2.0

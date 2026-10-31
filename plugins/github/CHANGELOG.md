# @amykit/plugin-github

## 0.7.0

### Minor Changes

- b761f29: **A config is typed by its schema.** `definePlugin` gives a plugin's register and ready hooks the post-validation type derived from its schema, rejects mismatched defaults, and moves every shipped schema onto that declaration. Scalar and `string[]` settings no longer cast away the host's validation; record settings remain explicitly narrowed where a plugin needs a stronger value shape.
- 989f399: **A workflow can call another, the way code calls a function.** A diagram
  marks a state `class X call`, and `calls` binds it to the workflow it calls:
  `call(review, { input, config, ports, output, effects })`, every member
  optional. The callee runs as a child record kept inside its caller's
  (`TBO-1/REVIEW#1`), with its own history and attempts, and only the deepest
  record in a call is observed. When the child ends, the caller takes the edge
  named for that end, folding what it returned. Before this, composing
  workflows meant importing another's states and record fields in TypeScript,
  and nothing showed or checked where one ended and the other began.
  
  Everything that can be wrong with a call is refused at boot, naming the call
  path: a call state with no binding, an end with no edge, an `output` for an
  end that returns nothing, an `input` for a callee that takes none, a need no
  mounted port satisfies (`oncall → REVIEW → FIX: needs code-host`), a cycle at
  any depth, and a callee claiming a write its caller does not. `port()` takes
  `requires`, for a method a port only offers optionally.
  
  **The pull request is opened by one shipped workflow.** `note-to-plan` and the
  errand both opened a pull request and waited for it, written twice. Both now
  call `@amykit/workflow-pull-request`, which opens or finds one through the
  `CodeHost` port and returns `OPENED` with its number and link, or `REFUSED`
  with the host's reason. A refused pull request hands the work back with that
  reason, where before it failed every look until the machine gave up. The
  port gains `CodeHostRefusal`, and the GitHub adapter throws it for a 422, so
  an answer is told apart from an outage, which is still retried.
  
  **A callee can be copied in and owned.** `amy workflow add <spec> --into
  <name>` copies a workflow, with every file its entry imports, into one of your
  own, installing what it depends on; a dependency that cannot be resolved
  refuses the copy before anything is written. `amy workflow export --expand`
  draws each call as the workflow it calls, and `amy status` shows where work
  stands through its calls, with a callee's escalation as the root's attention.
- 3649573: Plugin versions and unused workflow observer declarations were removed; package manifests supply displayed versions.
- 2363da5: **The host lends the checkout.** `PluginContext` gains `checkouts()`, which answers with the `Git` and the layout for the calling plugin — the host's paths, the plugin's own `defaultBranch` and `baseBranch`, and the `worktree` port read whenever a path is asked for, so a worktree plugin listed after the caller is still the one used. The core exports `BRANCH_SETTINGS`, the two branch settings with one description, and every shipped schema that declares them spreads it in place of its own wording. The command gate, the plan check and the three workflows that opened pull requests ask their context instead of building a `Git` and a second copy of its layout. The settings stay per plugin, so no `config.yaml` changes; the plan check's `baseBranch` now defaults to `{}` like every other's.

### Patch Changes

- Updated dependencies [b761f29]
- Updated dependencies [2c7324c]
- Updated dependencies [ebae48c]
- Updated dependencies [989f399]
- Updated dependencies [7d2dd00]
- Updated dependencies [da95fc7]
- Updated dependencies [b83a214]
- Updated dependencies [3649573]
- Updated dependencies [f9b65f6]
- Updated dependencies [37504c1]
- Updated dependencies [2363da5]
- Updated dependencies [0815efb]
  - @amykit/core@0.7.0

## 0.6.0

### Minor Changes

- 9e3cb22: What a private workflow had to write for itself, the shipped one now does.
  
  - A commit status GitHub returns in lower case reads as passing or failing; every one used to read as running.
  - `Git` commits without pushing, and `push` refuses anything that is not a fast-forward, naming the branch. `commitAndPush` is built on the two.
  - A review thread carries the file it is on.
  - The code host finds a pull request by the id in its title, open or merged, and the author's pull requests somebody asked to change. A workflow that claims no writes is handed `pullRequestAncestry` and both of these.
  - `ticket-to-qa` takes `policy.writes: operator`: every tracker and code-host write is said once, in the work's thread or through the notifier, and the machine waits until it sees it made. The workflow then claims no writes at all.
  - A ticket Linear labels into several repositories (`repoByLabel`) is one work item per repository, `TICKET@owner%2Fname`, and QA receives it once, when every one has merged.
  - `file-queue` takes `order: priority`: the most urgent due item first, first in first out within one priority, refreshed on every discovery from the tracker's own urgency.

### Patch Changes

- Updated dependencies [9e3cb22]
  - @amykit/core@0.6.0

## 0.5.0

### Minor Changes

- 3a993e1: Let workflows resolve the base of a stacked pull request through the code-host port.

### Patch Changes

- 1641aed: `reviewsRequestedOf` and `changesRequestedOf` work. Their GraphQL document named its variable `$query`, and the document itself travels to `gh` as the field `query`, so every call claimed that field twice and `gh` refused it before GitHub was reached: `unexpected override existing field under "query"`. The variable is `$search` now.
  
  `submitReview` works. It sent the state a review is read as (`event=APPROVED`), and the REST API takes `APPROVE`, `REQUEST_CHANGES` and `COMMENT`. The state is mapped to the event now, and `DISMISSED`, which is not a review anyone submits, is refused.
- Updated dependencies [d490ceb]
- Updated dependencies [b8c781a]
- Updated dependencies [c1edd17]
- Updated dependencies [5ff03ad]
- Updated dependencies [3a993e1]
- Updated dependencies [f259468]
- Updated dependencies [75e1f57]
- Updated dependencies [8b2fcc8]
- Updated dependencies [9bb3d24]
- Updated dependencies [98cc10e]
  - @amykit/core@0.5.0

## 0.4.0

### Patch Changes

- c7a36eb: A base branch per repository.
  
  `baseBranch:` maps a repository to its own base branch beside `defaultBranch`,
  which keeps its name and stays the fallback; a config without the block
  resolves exactly as before. The map rides `pluginSlices` to every reader of
  the layout — the harnesses, the gate, the worktree manager, whose trees are
  cut from the mapped branch, and the workflows, which resolve the repository's
  own base where the piece of work is known — and the pull request each workflow
  opens is told that base by name, falling back to the forge's own default when
  nothing was named.
- 0ca2c1c: A reply inside a review thread reaches the agent.
  
  `ReviewThread` carried the first comment of a thread and nothing that
  followed it, so a reviewer's correction written inside the thread sat one
  field away from every consumer: `address-threads` handed the agent what the
  thread *started* with, and "whose turn is it" was a question the view could
  not answer. The port grows `comments` — the conversation, oldest first,
  opening comment included — and `author`/`body` stay the opening comment's,
  so a consumer that never asked for the conversation is unaffected and
  `comments.at(-1)?.author` answers whose turn a thread is from the view
  alone. The GitHub query asks for `comments(first: 50)` with `createdAt` in
  the same request, and the adapter maps the list. The `address-threads`
  prompt renders the conversation attributed — a later comment is introduced
  as a reply, not restated as the objection — and says that a later comment
  answers the earlier ones, so an agent handed a correction inside the thread
  is handed the correction.
- fc6748a: The forge is asked, not run beside.
  
  Every gap in a port became an adapter in whoever hit it: a workflow that
  needed what the plugins know was shelling out to `gh` beside the plugin that
  already owned it and opening its own GraphQL connection to Linear beside the
  tracker that already had one, and the second workflow to hit the same gap
  wrote it all again. The port grows what the adapters were compensating for.
  
  `CodeHost` grows `pullRequest(repo, number)` — readable merged or not, the
  open-only filter staying where it belongs, in the by-branch search — and
  `PullRequestView` grows `merged` and `base`, mapped from the same node in
  the same query, with both reads running one shared fragment so they cannot
  drift apart. It grows `merge(repo, number, method)`, the method the base's
  ruleset allows being the caller's to name; `submitReview(repo, number,
  review)`, the state as forge vocabulary and the decision to submit as
  workflow policy; `createIssue(repo, { title, body })`; `commitStatuses(repo,
  sha)`, so a freeze is a workflow's reading of a status list rather than a
  private `gh api` of its own; and `changesRequestedOf(login, repos)`, the
  mirror of `reviewsRequestedOf` — "where did my review leave changes
  requested" — kept honest by the adapter reading each candidate by number,
  because the search cannot narrow on who left the changes requested.
  
  The tracker carries what a ticket is: `ISSUE_FIELDS` grows
  `labels { nodes { name } }` and `Ticket` grows `labels: string[]` — a label
  is how a team says what a ticket *is*, and with the description and the
  comments already shipped, the Linear reader a workflow carried has nothing
  left in it. What stays in the workflow is policy: which review state to
  submit, whose thread to close, what counts as a freeze.
- 5b37451: The ports belong to the core.
  
  `Tracker`, `Agent`, `Gate`, `Ticket` and the outcome contracts they carry
  moved from `@amykit/workflow-ticket-to-qa` to `@amykit/core`, beside
  `CodeHost` and `Harness`, so a workflow nobody shipped declares every port
  it needs by importing `@amykit/core` and no plugin in the install depends
  on a workflow package to know what a tracker is. The workflow re-exports
  every name for one minor version so nothing breaks on the way past, and
  the tracker contract grows a declared write surface: reads
  (`TrackerReads`) and writes (`TrackerWrites`) are separate interfaces a
  mount can hand out separately, with `TRACKER_WRITE_CAPABILITIES` naming
  what each core action resolves to.
- bfda1ac: The threads close when they are answered.
  
  `CodeHost` carried no way to settle a review conversation, so a workflow
  state whose exit reads "no open thread" could not reach its own exit: the
  code was fixed, the forge kept the thread open, and a ticket that had done
  nothing wrong escalated at the ceiling. The port grows
  `resolveReviewThread` and `unresolveReviewThread` — one id, one call — the
  GitHub adapter runs the `resolveReviewThread`/`unresolveReviewThread`
  GraphQL mutations through the scripted runner, and the action catalogue
  grows `resolve-review-thread`, dispatched to the code-host port, so a mount
  that cannot run it is refused at boot by name.
  
  The ticket-to-qa machine presses the button where the gap was: inside
  `COPILOT_FIX`, threads the record judged `fixed` and the forge still holds
  open get one act of `resolve-review-thread` each, and the next look finds
  them resolved and leaves through the exit condition instead of through the
  attempts. Who may close what stays the workflow's policy — only the
  automated reviewer's threads, only the ones the machine itself answered,
  and never a colleague's; `HUMAN_FIX` does not emit the effect at all.
- Updated dependencies [c7a36eb]
- Updated dependencies [2dc9117]
- Updated dependencies [b3b7a07]
- Updated dependencies [0ca2c1c]
- Updated dependencies [c30789e]
- Updated dependencies [fc6748a]
- Updated dependencies [5b37451]
- Updated dependencies [bfda1ac]
- Updated dependencies [f1557f6]
  - @amykit/core@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [4b54a6f]
  - @amykit/core@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [e603b3b]
  - @amykit/core@0.3.0

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

# A stack knows its parent

Workflows that stack pull requests need one explicit stack parent, and
today they cannot say so: `OpenPullRequestRequest` carries no base
(`packages/core/src/ports/CodeHost.ts:98`), and the GitHub adapter
resolves the default branch internally on every open
(`plugins/github/src/GitHubCodeHost.ts:139`), so every PR amy opens is a
root with no stack above it. The base a stacked PR must land on is not
the repository's default branch — it is its parent's head.

The read side is blinder than the write side. `findPullRequest` queries
`states: [OPEN]` (`plugins/github/src/GitHubCodeHost.ts:18`), so a merged
parent is invisible: the stack resolution the workflows need — open
parent => its remote head branch; merged parent => its recorded base;
absent or closed-unmerged => wait — cannot be answered through the port
at all, and each workflow would reimplement the GitHub-specific lookup
on its own. The Revv workflow hit this driving stacked PRs against real
repositories (issue #48).

Not every workflow stacks PRs, so nothing here may be required of a
workflow that does not: this is a port growing a capability, not a new
obligation on every port implementor.

## What changes

**The port grows stack facts.** `OpenPullRequestRequest` gains optional
`base?: string` — the branch to target; absent still means the
repository's default, which is every install today. `PullRequestView`
gains `baseBranch: string`, so the fold can compare the head against the
base it actually opened on. Neither field breaks an implementor that
ignores them, which is what keeps a second workflow's stacked PR from
being this port's problem.

**The port grows the parent lookup.** `CodeHost` gains
`pullRequestAncestry(repo, number): Promise<PullRequestAncestry | null>`
returning `{ state: "open" | "merged" | "closed-unmerged" | "absent",
headBranch, baseBranch }` — the resolved base every observation can
recompute from, with no workflow learning what a forge is. The GitHub
adapter answers it from the same GraphQL surface it already queries,
with `states:` widened so a merged parent is a result and not a
blank. An implementor that cannot answer returns null, and the workflow
waits.

**Where the stack parent is recorded.** The tracker's many product
dependencies stay the tracker's; the stack parent is one field on the
work item's own record, written when the item is created and read every
observation through the port — never a second copy in the config. The
workflow folds `state: "merged"` into "my base is the parent's recorded
base", `open` into "my base is the parent's head branch", and everything
else into a wait with a reason, which is the whole of the domain logic
and all of it stays workflow-side.

**The six-place config sweep does not apply.** No new config field ships
with this plan: the base is data on the record and facts from the
forge, not a setting. The only config-adjacent move is the template's
skills section gaining a half-step example, delivered by the sibling
plan ([a-skill-for-the-half-step.md](a-skill-for-the-half-step.md)).

## The gate

`plugin-github`, extended — it owns the adapter the ancestry query
lives in, and its scenario already stands up a stand-in forge:

- `stack.a_pull_request_opens_on_the_parent_head_while_it_is_open`
- `stack.a_merged_parent_answers_its_recorded_base`
- `stack.an_absent_parent_or_one_closed_unmerged_waits`
- `stack.no_workflow_learns_the_word_github`

There is no `plugin-github` gate today. One ships with this plan, with
the same shape as the file-queue one: activation on
`plugins/github/src/**`, evidence at
`.software-factory/evidence/plugin-github.json`, assertions on the
built artifacts against the stand-in forge the repo already has, so the
ancestry lookup is proven against a server-shaped thing rather than a
mock that answers whatever the test asked.

## Acceptance criteria

- [ ] A pull request opens with an explicit base and lands on it
      (proof: assertion:stack.a_pull_request_opens_on_the_parent_head_while_it_is_open)
- [ ] A merged parent resolves to its recorded base through the port
      (proof: assertion:stack.a_merged_parent_answers_its_recorded_base)
- [ ] An absent or closed-unmerged parent yields a wait, not a guess
      (proof: assertion:stack.an_absent_parent_or_one_closed_unmerged_waits)
- [ ] No workflow package names a forge
      (proof: assertion:stack.no_workflow_learns_the_word_github)
- [ ] An implementor that ignores the new fields passes unchanged
      (proof: test:packages/core/tests/CodeHost.test.ts)
- [ ] `findPullRequest` on an open PR still returns its view, and the
      view names the base it opened on
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)

**Exit condition:** a workflow that stacks pull requests names one
explicit parent per item, resolves the base from the remote code host on
every observation, and never learns which forge answered.
# A stack knows its parent

A workflow that stacks pull requests cannot safely invent a base from a
repository default. It names its parent by number and asks the code-host port
for the parent's current ancestry on every observation.

`OpenPullRequestRequest.base` remains optional, so the existing default-branch
behaviour is unchanged. A stacked child supplies the parent head while that
parent is open. `PullRequestAncestry` says whether the parent is open, merged,
closed without merging, or absent; an open parent carries its head and base,
and a merged parent carries the base it landed on. The workflow owns the policy:
it opens against the applicable branch and waits on absent or closed-unmerged
parents. GitHub vocabulary and GraphQL stay in the adapter.

The GitHub adapter reads its narrow ancestry query by number. Its plugin gate
runs the built artifact against a command-runner stand-in and checks explicit
bases, open and merged parent facts, the honest wait states, and that workflow
source never imports the forge.

## Acceptance criteria

- [x] A pull request opens with an explicit base and lands on it
      (proof: assertion:stack.a_pull_request_opens_on_the_parent_head_while_it_is_open)
- [x] A merged parent resolves to its recorded base through the port
      (proof: assertion:stack.a_merged_parent_answers_its_recorded_base)
- [x] An absent or closed-unmerged parent yields a wait fact, not a guessed base
      (proof: assertion:stack.an_absent_parent_or_one_closed_unmerged_waits)
- [x] No workflow package names a forge
      (proof: assertion:stack.no_workflow_learns_the_word_github)
- [x] Existing implementors can keep their default pull-request behaviour
      (proof: test:packages/core/tests/CodeHost.test.ts)
- [x] An open pull request still carries the base it opened on
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)

**Exit condition:** a workflow that stacks pull requests names one explicit
parent per item, resolves the base from the remote code host on every
observation, and never learns which forge answered.

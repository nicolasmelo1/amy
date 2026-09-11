# The worktree is the workplace

One checkout per repository is one shared mutable tree, and everything that
touches it contends for it. `Git.prepareBranch` runs `git checkout -B`
against `origin/<branch>` (`packages/core/src/git.ts:41`), which resets the
checkout to the ticket's branch in place — so two tickets on the same
repository cannot implement at the same time, an interrupted run leaves a
dirty tree that blocks the next ticket's gate, and `git checkout -B` can
repoint a branch an existing PR is built on merely to prepare another item.
The workflows compensate rather than isolate: every runtime calls
`git.prepareBranch` then `git.pathFor` (`packages/workflow-note-to-plan/src/runtime.ts:128`)
and passes that path to the agent, the gate runs `cwd: this.git.pathFor(repo)`
(`plugins/command-gate/src/CommandGate.ts:48`), and the harness writes into
the same tree the agent is about to change
(`packages/agent-kit/src/HarnessAgent.ts:248`). Workflows should not each
have to invent checkout isolation, cleanup, discovery and recovery.

This was found on a private workflow driving amy against real pull
requests (issue #46), but the checkout is amy's shared surface, not one
workflow's: the fix is a core seam, not a workflow plugin.

## What changes

**The core grows a worktree port.** `packages/core/src/ports/` gains
`Worktree.ts` with three capabilities — `acquire(workId, repo)` returns the
path of an isolated tree on the ticket's branch and creates or reuses it;
`states()` answers which worktrees exist and what state each is in (clean,
dirty, in-flight, terminal); `release(workId, repo)` removes a tree that
has become safe to remove. The mount gains the port kind `worktree` beside
`code-host` and `tracker` (`packages/core/src/mount.ts`), and a core action
backing it lands in `CORE_ACTIONS` (`packages/core/src/actions.ts`) so a
workflow never shells out to `git worktree` on its own.

**`Git` grows worktree mode without losing shared-checkout mode.** The same
`Git` class answers both: `pathFor` resolves through the worktree manager
when worktrees are enabled for the mount, and through `workspaceRoot` when
they are not, so every caller — `HarnessAgent.ask`
(`packages/agent-kit/src/HarnessAgent.ts:248`), `PlanCommandCheck`
(`plugins/plan-check/src/PlanCommandCheck.ts:50`), `CommandGate`
(`plugins/command-gate/src/CommandGate.ts:48`) — receives its own path and
no caller changes its shape. `prepareBranch` inside a worktree does not
repoint the shared checkout's branch: it cuts the worktree from the
configured base without touching the standing checkout, so **two work
items in one repository can run concurrently without branch interference**
and an interrupted item never leaves the shared tree dirty. A workflow may
opt out only with a documented shared-checkout need
(`worktrees.enabled: false` per workflow slice).

**Storage, retention, and operator surface.** Trees live under
`~/.amy/worktrees/<workflow>/<work-id>/<owner-repo>/`, predictable and
outside any repository. Terminal, clean trees are prunable after
`worktrees.retentionDays` (default 7) and removals log an event-log entry
explaining every removal — the same honesty as `run.idle` and
`budget.parked` (`packages/core/src/ports/EventLog.ts:100`). Dirty, failed
or escalated trees are retained by default and `amy worktrees list` names
state, workflow, work id, repository, branch, cleanliness and retention
eligibility; `amy worktrees remove <work-id>` refuses in-flight or dirty
trees unless `--force`. The daemon runs the same safety predicates on
startup and after terminal work, and every automatic removal carries the
same event. Orphaned trees (their work id no longer in the store) are
offered for recovery by `amy worktrees list` before any prune touches
them.

**Configuration.**

```yaml
worktrees:
  enabled: true
  root: ~/.amy/worktrees
  retentionDays: 7
  pruneOnStart: true
```

`enabled: true` is the default the plan ships, because the acceptance
criteria demand concurrent work as the ordinary case, not the exception. The
field is read in `fromParsed` with `~` expanded the way `workspaceRoot`
already is (`packages/cli/src/config.ts:193`), and the six-place config
sweep applies: interface, `DEFAULT_CONFIG`, `EXAMPLE_CONFIG` template prose,
`slices.ts` derived map, `doctor.ts` checks, every `worktrees:`-shaped
literal in `packages/cli/tests`.

**Migration is honest about the standing checkout.** The worktree manager
never touches an existing checkout's uncommitted work: acquiring a worktree
does not reset or repoint anything, and an install whose `workspaceRoot`
holds dirty checkouts keeps them, with `amy doctor` reporting both roots.
Existing installs migrate by running `amy worktrees list` and pruning what
is retention-eligible — nothing moves under them.

## The gate

`ticket-to-qa`, extended — it is the gate that drives work in a checkout,
and isolation is only real if a piece of work runs in its own tree:

- `worktree.two_items_in_one_repository_run_concurrently`
- `worktree.the_agent_the_gate_and_git_effects_receive_the_own_path`
- `worktree.a_crash_or_dirty_tree_never_deletes_a_worktree`
- `worktree.a_terminal_clean_tree_is_prunable_after_retention`
- `worktree.the_list_names_state_workflow_repo_branch_and_cleanliness`
- `worktree.an_orphaned_tree_is_offered_for_recovery`
- `worktree.prune_refuses_an_in_flight_tree`
- `worktree.preparing_an_item_never_repoints_the_shared_checkout_branch`

Its scenario drives two pieces of work in the same repository concurrently
and asserts the branch each PR lands on, the worktree paths the agent and
gate saw, and the event-log line for each removal.

## Acceptance criteria

- [ ] Two work items in the same repository implement and gate concurrently
      without branch or dirty-tree interference
      (proof: assertion:worktree.two_items_in_one_repository_run_concurrently)
- [ ] Agent, gate and git effects for an item receive only its own
      worktree path (proof: assertion:worktree.the_agent_the_gate_and_git_effects_receive_the_own_path)
- [ ] A crash, escalation, failed action or dirty tree never triggers
      automatic deletion (proof: assertion:worktree.a_crash_or_dirty_tree_never_deletes_a_worktree)
- [ ] A terminal, clean worktree is prunable after retention and the
      removal is logged (proof: assertion:worktree.a_terminal_clean_tree_is_prunable_after_retention)
- [ ] `amy worktrees list` names state, workflow, work id, repository,
      branch, cleanliness and retention eligibility
      (proof: assertion:worktree.the_list_names_state_workflow_repo_branch_and_cleanliness)
- [ ] An orphaned worktree is offered for recovery before pruning
      (proof: assertion:worktree.an_orphaned_tree_is_offered_for_recovery)
- [ ] Preparing another item never resets or repoints an existing ticket
      branch (proof: assertion:worktree.preparing_an_item_never_repoints_the_shared_checkout_branch)
- [ ] Existing installs keep their uncommitted work and both roots are
      reported by `amy doctor`
      (proof: test:packages/cli/tests/doctor.test.ts)

**Exit condition:** two work items in the same repository drive their whole
lifecycle concurrently, each in its own worktree, and no workflow had to
invent isolation, cleanup, discovery or recovery to get it.
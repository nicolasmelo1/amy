# The errand is proven end to end

Three workflows ship in this repository. Two of them are driven by a gate:
`ticket-to-qa` walks a ticket to QA against stand-in services, `note-to-plan`
walks friction to a pull request. The third — `@amykit/workflow-errand`, the
one behind `amy btw`, the shortest road anybody has into this machine — had a
walkthrough test and nothing else. No scenario installed it, and
`packages/workflow-errand/src` and `plugins/file-tasks/src` appeared in no
gate's activation, so neither could expire a proof by changing.

That was the gap [every plugin is proven end to end](every-plugin-is-proven-end-to-end.md)
was written about, still open on the one workflow most likely to be somebody's
first: a barrel that forgets an export, a `dist` that never got built, a task
file whose shape changed — all of them pass the whole suite and all of them
are broken on the machine that installs them.

It is also the workflow where the file half is load-bearing. `amy btw` writes
a task file that a later process reads; the two halves never meet inside one
test run, which is exactly the seam a unit test cannot cover and a scenario
can.

## What the run does

`errand-scenario.sh` installs the executable into a scratch directory and
drives it, with the commands an operator types, through five errands in one
real git repository:

| Said in passing | What the machine must make of it |
| --- | --- |
| typed at `amy btw` | a task file, a queue item, an agent, a branch, a pull request |
| dropped in `~/.amy/tasks/` by hand | the same, found by `amy discover` rather than queued by a command |
| a sentence the agent commits itself | a clean tree the workflow still has to notice and deliver |
| a sentence the agent refuses | `DECLINED`, with the refusal on the announcement, after one attempt |
| a repository this install does not work in | `DECLINED` without spending an agent on it at all |

The agent is a `claude` on the `PATH` that edits `api/package.json` in the
checkout it is handed, answers a question without touching the tree, and
refuses the third in its own words. The code host is a `gh` that keeps pull
requests in a JSON file. Neither is scripted to a decision: the stand-in reads
the prompt it was given, which is the same sentence the operator typed.

There is no tracker in the run and no credential, and nothing reaches the
internet.

The gate is `errand`, citing this note, with the activation the assertions
rest on: the workflow and its diagram, the task store, the CLI, the harness
the sentence is handed to, and the git and forge a change rides on. The
sentence the plan asked for is now true: editing the errand workflow or the
task store turns `sf check` red until the scenario is run again and resealed.

## What the first run found

The scenario was written expecting the answer errand to end in `DONE` with no
pull request, and the first run opened one anyway — an empty one.

`run-errand` decided whether the errand had changed something by asking
whether the push had moved the remote. But `prepareBranch` has already
created the branch, so publishing it for the first time is a new remote ref
whether or not it carries a commit: a question was delivered as a pull
request with no diff in it, which is worse than not delivering it, because it
asks somebody to review nothing.

The fix is in the same half that had the bug, not in the scenario. `Git` grew
`commitsAhead(repo, of, workId)` — how many commits the item's tree holds
beyond a branch — and `run-errand` now commits, asks that question, and only
pushes when the answer or the commit says there is something to review. A
clean tree is a finished errand again, and the branch stays local. The
criterion below is the one that holds it: the second errand leaves no branch
on the origin at all.

## What the review found

The first version of the scenario passed the refusal criterion without the
workflow meeting it. A refusal came back as an error, and the run set
`maxAttempts: 1`, so `DECLINED` was the attempt ceiling and not a decision. Under
the prompt as written, a real agent that refused would have left a clean tree
and landed in `DONE`, as if it had answered.

The errand now has a word for it. The prompt asks a refusal to end with one
line, `{"declined": "why"}`. `declinedIn` reads only the last line, so an answer
that quotes JSON is still an answer. `planWorking` declines on it before it
looks at attempts. The scenario runs with the production budget of two, and
the criterion holds because the refused errand is asked exactly once.

## Acceptance criteria

- [x] A remark typed at `amy btw` is a task file that the next `discover`
      claims, on the installed executable rather than in a test process
      (proof: assertion:errand.a_passing_remark_reaches_the_queue)
- [x] The agent runs in the repository the errand named, and never in the state
      directory
      (proof: assertion:errand.the_agent_runs_where_the_work_is)
- [x] An errand that changed something opens a pull request, and one that
      changed nothing reaches `DONE` without opening one
      (proof: assertion:errand.a_change_opens_a_pull_request)
- [x] An errand whose agent committed the work itself is delivered from that
      commit, so a clean working tree is not mistaken for nothing to review
      (proof: assertion:errand.already_committed_work_is_delivered)
- [x] An errand that changed nothing leaves no branch on the origin, so there
      is nothing anybody could be asked to review
      (proof: assertion:errand.an_unchanged_branch_is_not_delivered)
- [x] An errand the agent refuses lands in `DECLINED` with the reason on the
      announcement, rather than retrying until the ceiling
      (proof: assertion:errand.a_refusal_is_terminal_and_says_why)
- [x] The lifecycle walks in the order it declares, one look makes at most one
      move, and it settles instead of spinning
      (proof: assertion:errand.the_lifecycle_walks_in_order)
- [x] Its records and queue live under `~/.amy/errand/`, and another profile's
      state is untouched by the run
      (proof: assertion:errand.the_profile_keeps_its_own_state)

**Exit condition:** editing `packages/workflow-errand/src` or
`plugins/file-tasks/src` turns `sf check` red until the errand scenario is run
again and resealed — the same sentence that is already true of the other two
workflows, and of no part of this one before this note.

## What else the run proves, without a criterion

These are asserted by the same run and reported beside the ones above. They
name the ordinary health of the workflow rather than a promise the plan made,
so they are not required by the gate: that a file dropped in the tasks
directory is discovered and a second `discover` queues nothing new
(`errand.a_task_in_the_directory_is_discovered`), that each errand is asked
once (`errand.the_agent_is_asked_once_per_errand`), that an errand about
another repository is handed back without an agent call
(`errand.a_task_nobody_works_in_is_handed_back`), that every arrow the
installed diagram draws is walked (`errand.every_drawn_edge_is_walked`), that
the installed machine mounts the workflow and the task store
(`errand.the_installed_machine_mounts_the_workflow`), and that the run leaves
nothing in the directory it was started from
(`errand.the_run_leaves_nothing_behind`).

## Since the errand calls another workflow

[A workflow calls another](a-workflow-calls-another.md) moved the errand's
`PR_OPEN` onto a call to `@amykit/workflow-pull-request`, as a draft. The run
gained an errand whose change the code host refuses, so the new arrow is
walked like the others, and two assertions the gate requires:
`errand.the_pull_request_is_opened_by_a_call` — the change and the committed
errand each opened by the call, holding the number the stand-in `gh` gave, and
the announcement carrying the link — and
`errand.a_refused_pull_request_hands_the_errand_back`, with the host's reason
said on the way out of the call.

## Since the machine brings its own commands

[A plugin brings its own commands](a-plugin-brings-its-own-commands.md) moved
`amy btw` into this workflow, and moved `discover` into `tick`. The run now
types one command where it used to type two, and the gate says so:
`errand.a_tick_discovers_before_it_moves` — the hand-written task files were
never on the queue, and the tick that found them is the tick that moved one.
(`discover` is hidden and still callable: the scenarios that drive a move at a
time queue with it, and `tick` looks first for everybody else.)
`errand.a_command_nothing_mounts_does_not_exist` — `amy roster`, which belongs
to another workflow, is an unknown command on this machine — and
`errand.help_lists_only_the_machines_commands` — `amy --help` carries the
commands this machine mounted (`btw` from the errand, `worktrees` from the
worktree adapter, `models` from the relay) and none of pause, resume,
discover, poke, note or roster, which either went, are hidden, or belong to a
workflow this machine does not drive.

## The files

| | |
| --- | --- |
| `world.ts` | the repository, the code host, the task sentences and the config |
| `bin/gh`, `bin/claude` | the two stand-ins, each a `sh` wrapper running the `.ts` beside it through tsx |
| `drive.ts` | the run: the commands, the assertions, the report |

Run it with `./.software-factory/evidence/errand-scenario.sh`, or with
`--keep` to leave the world on disk and read the queue, the records, the
agent's log and the branches yourself.

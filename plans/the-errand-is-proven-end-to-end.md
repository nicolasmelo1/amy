# The errand is proven end to end

Three workflows ship in this repository. Two of them are driven by a gate:
`ticket-to-qa` walks a ticket to QA against stand-in services, `note-to-plan`
walks friction to a pull request. The third — `@amykit/workflow-errand`, the
one behind `amy btw`, the shortest road anybody has into this machine — has a
walkthrough test and nothing else. No scenario installs it, and
`packages/workflow-errand/src` and `plugins/file-tasks/src` appear in no gate's
activation, so neither can expire a proof by changing.

That is the gap [every plugin is proven end to end](../docs/design/every-plugin-is-proven-end-to-end.md)
was written about, still open on the one workflow most likely to be somebody's
first: a barrel that forgets an export, a `dist` that never got built, a task
file whose shape changed — all of them pass the whole suite and all of them are
broken on the machine that installs them.

It is also the workflow where the file half is load-bearing. `amy btw` writes a
task file that a later process reads; the two halves never meet inside one test
run, which is exactly the seam a unit test cannot cover and a scenario can.

## What changes

A scenario, `errand-scenario.sh`, in the shape the other four already have: the
installed executable, a scratch home, a real git repository, a stand-in `claude`
and `gh` on the PATH, no credential and no network. It types what an operator
types — `amy btw`, `amy --workflow errand discover`, `amy --workflow errand
tick` — and reads the argv log and the event log for its assertions.

A gate, `errand`, citing a durable design note, with the activation the
assertions rest on: `packages/workflow-errand/src/**`,
`plugins/file-tasks/src/**`, `packages/agent-kit/src/**` and
`packages/cli/src/**`.

The lifecycle it drives is the whole of the workflow: `QUEUED` → `WORKING` →
`PR_OPEN` → `DONE`, and the `DECLINED` road beside it. `QUEUED` is the only
waiting state, and it waits only at the ceiling, so the run is short.

## Acceptance criteria

- [ ] A remark typed at `amy btw` is a task file that the next `discover`
      claims, on the installed executable rather than in a test process
      (proof: assertion:errand.a_passing_remark_reaches_the_queue)
- [ ] The agent runs in the repository the errand named, and never in the state
      directory
      (proof: assertion:errand.the_agent_runs_where_the_work_is)
- [ ] An errand that changed something opens a pull request, and one that
      changed nothing reaches `DONE` without opening one
      (proof: assertion:errand.a_change_opens_a_pull_request)
- [ ] An errand the agent refuses lands in `DECLINED` with the reason on the
      announcement, rather than retrying until the ceiling
      (proof: assertion:errand.a_refusal_is_terminal_and_says_why)
- [ ] The lifecycle walks in the order it declares, one look makes at most one
      move, and it settles instead of spinning
      (proof: assertion:errand.the_lifecycle_walks_in_order)
- [ ] Its records and queue live under `~/.amy/errand/`, and another profile's
      state is untouched by the run
      (proof: assertion:errand.the_profile_keeps_its_own_state)

**Exit condition:** editing `packages/workflow-errand/src` or
`plugins/file-tasks/src` turns `sf check` red until the errand scenario is run
again and resealed — the same sentence that is already true of the other two
workflows, and of no part of this one today.

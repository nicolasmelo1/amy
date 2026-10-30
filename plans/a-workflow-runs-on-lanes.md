# A workflow runs on lanes

amy is synchronous, and that is worth keeping. One move per look, one look per
item, and a record is always in one state you can point at. Reading what the
machine is doing is reading a diagram with a mark on it.

But a lot of work is a factory line, not a single file. Some pieces can run
side by side and meet again after: three tasks of one feature on three
branches, three reviewers of one change, three repositories of one ticket.
Today that is one record at a time, serially, or it is written by hand in a
workflow's runtime, out of the diagram's sight.

`docs/concepts/the-engine.md` already says a concurrent engine is a plugin, as
long as it keeps the atomic claim, one move per look, and the budget check
before the call. What is missing is where a workflow says what may run in
parallel. A setting would be one more place to keep in step with the diagram.
The diagram is where it belongs.

## What changes

**A lane is a line in the diagram.** Mermaid already has the syntax:
`<<fork>>` splits one path into several, and `<<join>>` waits for all of them.
The subset (*a workflow is a Mermaid diagram*) stops refusing the two, and
gives them one meaning. Every branch of a fork is a lane, and the number of
lanes is the number of lines drawn:

```mermaid
stateDiagram-v2
    state split <<fork>>
    state merge <<join>>
    PLANNED --> split
    split --> TASK_A
    split --> TASK_B
    split --> TASK_C
    TASK_A --> merge: DONE
    TASK_A --> merge: DECLINED
    TASK_B --> merge: DONE
    TASK_B --> merge: DECLINED
    TASK_C --> merge: DONE
    TASK_C --> merge: DECLINED
    merge --> INTEGRATED: every lane is done
    merge --> ESCALATED: a lane declined
    class TASK_A, TASK_B, TASK_C call
```

There is no `lanes:` setting. To run four lanes, draw four. What a reader sees
on GitHub is what the machine runs.

**A record stays in one state. Every lane is a call.** The reader refused fork
and join because "a record is in one state at a time" (`packages/core/src/diagram.ts`).
That stays true. Every branch of a fork must be a call state
(*a workflow calls another*), and each lane is its own child record, with its
own state, history and attempts:

- **At the fork,** the caller's record waits in the fork, and every branch
  starts its callee at once.
- **Input per lane.** Each lane takes its input from its own call binding:
  `TASK_A` gets the first task, `TASK_B` the second.
- **Into the join, the call contract holds.** A lane is a call, so every
  terminal state of its callee needs an edge out of the lane, labelled with
  that state (*a workflow calls another*). In a fork, each of those edges leads
  to the join. A lane terminal with no edge into the join is refused at boot,
  as it would be anywhere else.
- **At the join,** the caller moves on only when every lane has ended. The
  join is the caller's decision point: its `decide` key reads which terminal
  state each lane ended in, with every lane's output folded in and keyed by the
  lane's state. It picks one of the join's outgoing edges. The join holds no
  record of its own. It is where the caller's record waits until it decides.
- **When a lane escalates,** its siblings carry on, and the caller waits in the
  join. The join reports which lanes are done and which one needs the person.

Within a lane, everything is as synchronous as today. Parallelism is only
between records that are already separate.

**Lanes hold what they use, and the host decides who waits.** Three lanes can
contend for the same things:

- **A checkout.** The private workflow's `waitForTheTree` exists because two
  pieces of work shared one tree. A lane's checkout comes from
  `ctx.checkouts()` (*the host lends the checkout*), one worktree per lane
  ([the worktree is the workplace](../docs/design/the-worktree-is-the-workplace.md)).
  Separate worktrees do not stop two lanes from writing one branch.
  `Git.prepareBranch()` checks a branch out with `--ignore-other-worktrees`,
  and which branch a lane uses is known only at run time, from its input. So
  the host keeps an atomic lease per repository and branch, taken the way the
  file queue takes a claim, before any checkout or mutation. A lane that asks
  for a branch another lane holds waits on it. That wait costs no attempt
  (*waiting is not trying*), and the lane looks again when the lease is
  released. Boot refuses only a conflict it can see without running anything:
  two call bindings whose branch is the same literal.
- **The revision a lane checks.** A lane that checks the caller's work, not
  writes its own, needs the caller's change, not the base.
  `WorktreeManager.acquire()` makes a new worktree detached at the
  repository's base (`plugins/file-worktree/src/manager.ts`). So a call binding
  may pass `revision`: the commit the caller's record holds. The host then
  lends that lane a worktree detached at that commit, read-only for the lane.
  Every lane of the fork sees the same commit, and none of them can move the
  caller's branch.
- **An agent.** Every lane's run passes the same budget check before the call,
  and a usage limit refunds the attempt (*waiting is not trying*). Three lanes
  hitting the limit wait, they do not fail.
- **A pull request.** Lanes that open pull requests on one repository open
  separate ones. Integrating them is the state after the join, drawn as such.

None of these is declared by the workflow. They follow from the ports a lane
uses, and the host serialises what two lanes would otherwise share.

**The engine claims more than one item at once, and nothing else changes.**
The serial engine stays the default and runs lanes one move at a time, in turn.
That is correct, only slower. A concurrent engine runs one move per lane at a
time, up to the number of lanes the mounted diagrams draw. It keeps the file
queue's atomic claim, one move per look, and the budget check before the call.
It is a plugin, as `docs/concepts/the-engine.md` says it should be.

**`ticket-to-qa` is the first workflow on lanes, and its scenario is the
proof.** Today it runs the gate, then the self-review, one after the other
(`CHECKED → SELF_REVIEW` in its `workflow.mmd`). One ticket showed what that
order costs. A stronger model approved the change twice, and the gate refused
it twice, on rules the reviewer never saw. The implementation was sent back
with half the findings each time. With lanes, `CHECKED` forks into a `GATE`
lane and a `SELF_REVIEW` lane, each a call. They join, and the
implementation gets both sets of findings in one round:

```mermaid
stateDiagram-v2
    state checks <<fork>>
    state verdict <<join>>
    IMPLEMENTING --> checks
    checks --> GATE
    checks --> SELF_REVIEW
    GATE --> verdict: GREEN
    GATE --> verdict: RED
    SELF_REVIEW --> verdict: APPROVED
    SELF_REVIEW --> verdict: CHANGES_ASKED
    verdict --> IMPLEMENTING: either found something
    verdict --> PR_OPEN: both are clean
    class GATE, SELF_REVIEW call
```

The `ticket-to-qa` scenario
(`.software-factory/evidence/ticket-to-qa-scenario.sh`) drives it end to end
through the installed executable, against its stand-in world. Both lanes are
bound with the implementation's commit as `revision`, and the scenario asserts
that the gate and the self-review each checked that commit and not the base. It runs once
under the serial engine and once under the concurrent one, and both runs must
reach the same record.

**The window draws lanes as lines.** The fork's lanes are drawn side by side,
each with its record's mark. A join shows how many lanes have arrived. That is
the factory floor: you see where the line backs up.

## Acceptance criteria

- [ ] A diagram whose fork branches are all call states mounts, one whose
      branch is not a call is refused naming it, and a join with a branch that
      never reaches it is refused
      (proof: deferred:test:packages/core/tests/diagram.test.ts)
- [ ] A fork of three lanes starts three callee records at once, each with its
      own input, and the caller leaves the join only when all three have
      ended, with every output keyed by lane
      (proof: deferred:test:packages/workflow-testkit/tests/lanes.test.ts)
- [ ] A lane that escalates leaves its siblings running, and the caller waits
      in the join saying which lane needs the person
      (proof: deferred:test:packages/workflow-testkit/tests/lanes.test.ts)
- [ ] Two lanes never share a worktree. Two lanes that ask for one repository
      and branch at run time take its lease in turn: the second waits without
      an attempt and goes on when the lease is released. Boot refuses only
      bindings whose branch is the same literal
      (proof: deferred:test:packages/core/tests/lanes.test.ts)
- [ ] A lane bound with `revision` checks a worktree detached at that commit,
      and cannot move the caller's branch
      (proof: deferred:test:packages/core/tests/lanes.test.ts)
- [ ] A lane terminal with no labelled edge into the join is refused at boot,
      and the join's `decide` reads every lane's terminal state and output
      (proof: deferred:test:packages/core/tests/diagram.test.ts)
- [ ] Under the serial engine, the lanes reach the same end state, in turn,
      as under the concurrent one, in the `ticket-to-qa` scenario
      (proof: deferred:assertion:lifecycle.lanes_end_the_same_serial_or_concurrent)
- [ ] In the `ticket-to-qa` scenario, a change the gate refuses and the
      self-review would approve goes back to the implementation once, carrying
      both lanes' findings, both lanes checked the implementation's commit,
      and the next round reaches `PR_OPEN`
      (proof: deferred:assertion:lifecycle.gate_and_self_review_run_as_two_lanes)

**Exit condition:** `ticket-to-qa`'s scenario runs its gate and its self-review
as two lanes and sends one round of findings from both back to the
implementation. It reaches the same record under the serial and the
concurrent engine, and the `ticket-to-qa` gate requires both assertions. A
lane that escalates leaves the other running, and the join says which lane
needs the person. The number of lanes is the number of lines in its
`workflow.mmd`, and nothing else.

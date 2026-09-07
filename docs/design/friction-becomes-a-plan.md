# Friction becomes a plan, and the queue stops needing a ticket

Phase 10, and it is two things that turn out to be one.

**The queue should accept work that is not a ticket.** `EnqueueRequest` is
already `{ workId, reason }` and knows nothing about trackers. The single
thing in the way is `observe()`: it resolves the work id against the tracker
and throws `PROJ-1 is not in the tracker any more` for anything else. So
every item on the queue has to exist in Linear, and nothing can be injected
by hand.

**And the failures should improve the repositories.** Every friction point
this machine hits — an adapter that lied, a step that needed three tries, a
limitation somebody worked around — is worth a plan in one of three
repositories: software factory, amy, or logion. Not a ticket in a tracker:
those three already have a `plans/` directory and an ordered
`next-steps.md`, which is where work is decided here.

The second is an instance of the first. A friction note has no ticket, needs
none, and has to reach a pull request anyway. Build the general thing and the
particular one is a workflow over it.

## The decision this rests on

**A second workflow, not more states in the first.** `ticket-to-qa` is
sixteen states about a ticket reaching QA; a note becoming a plan shares none
of them and would only ever be a branch inside every predicate. The engine
stopped knowing what a ticket is in
[the engine drives a workflow it does not know](plugins-are-installed-not-compiled-in.md),
so a second workflow now costs a `plan()` and a runtime rather than a fork.

This is also what settled that plan's one open criterion. It stayed open
there until a second workflow really went through the seam, and this is that
workflow — which is the right way round: the proof arrived because something
needed it, not because a checkbox wanted closing. It arrived carrying a
defect, too, which is the other thing a real second user is for. See below.

The lifecycle is short on purpose, because nothing in it waits on a person:

```text
NOTED ──► DRAFTED ──► CHECKED ──► PR_OPEN ──► DONE
             ▲            │
             └────────────┘
              sf check is red
```

`DRAFTED` is an agent writing `plans/<slug>.md` and its line in
`next-steps.md`. `CHECKED` is `sf check` in that repository, which is the
whole quality bar: a plan with no exit condition, or one missing from the
ordered list, is red by `L4.PLAN_DECLARES_EXIT_CONDITION` and goes back to the
agent with the finding. Nobody had to invent a rubric — the repository being
written into already has one, and it is the same one a human contributor
meets.

## Three things have to move, and they are small

**The forge port belongs to nobody in particular.** `CodeHost` is already
domain-free: `findPullRequest`, `openPullRequest`, `requestReview` and
`reviewLoad` mention a repository, a branch and a login, and not one of them
mentions a ticket. It only *lives* in the ticket workflow's package. It moves
to the core, where `Queue`, `Store`, `Notifier` and `EventLog` already are,
and both workflows mount the same `@amykit/plugin-github` behind it. `Gate` does
not move: `run(ticket)` is ticket-shaped, and a plan workflow's check is
`sf check` in a directory rather than a gate over a ticket.

**The harnesses have to be contributed as harnesses.** `contributeTiers`
builds a `HarnessAgent` — the ticket prompts, the branch handling, the commit
— and contributes that. The domain-free unit underneath is
`Harness.ask(prompt, cwd)`, which is what a second workflow wants: its own
prompts over the same ladder, the same budget and the same accounting. So the
harness plugins contribute the harness as well, the relay's ladder moves to
where both can use it, and `@amykit/plugin-claude` stops being a plugin only one
workflow can use.

**Work has to be injectable.** Two ways in, and both write the same queue:
`amy note "..."` for the one-liner, and a directory amy watches for the
longer ones, so a note can be written by an editor, by a hook, or by this
machine itself when a tick fails. The record carries the note and the
repository it is about; nothing resolves it against anything.

## What stops this becoming spam

The reviewer ceiling's argument applies with a different number: past
`maxOpenPlansPerRepo`, the workflow holds rather than opening another pull
request nobody has read. A machine that files twelve plans a day into three
repositories is not improving them, it is producing a backlog with a robot's
name on it.

And `sf` is the other half, for free: a plan that does not carry an exit
condition and a place in the execution order cannot go green, so the floor on
quality is the floor the repository already enforces on people.

## Acceptance criteria

- [x] A work item injected by command reaches the queue and is advanced
      without existing in any tracker
      (proof: assertion:plan.work_injected_by_command_reaches_the_queue)
- [x] A note dropped in the watched directory is picked up by `amy discover`
      alongside anything else that is due
      (proof: assertion:plan.a_note_in_the_watched_directory_is_discovered)
- [x] The two workflows run on the same engine, the same queue, the same
      store, the same log and the same budget, with no engine change between
      them (proof: assertion:plan.both_workflows_run_on_the_same_installed_binary)
- [x] The forge port is mounted once and used by both workflows
      (proof: test:packages/cli/tests/two-workflows.test.ts)
- [x] A second workflow's agent uses the same harness ladder and the same
      budget as the first, with its own prompts
      (proof: assertion:plan.what_the_agent_spent_lands_in_the_shared_log)
- [x] A drafted plan that `sf check` refuses goes back to the agent with the
      finding, rather than reaching a pull request
      (proof: assertion:plan.the_agent_is_told_what_the_check_said)
- [x] A plan that passes reaches a pull request in the repository it is about,
      naming the friction it came from
      (proof: assertion:plan.the_pull_request_names_the_friction_it_came_from)
- [x] Past `maxOpenPlansPerRepo`, nothing new is opened and the machine says
      so once (proof: assertion:plan.nothing_new_is_opened_past_the_ceiling)
- [x] A tick that fails in the ticket workflow leaves a note behind, so the
      thing that broke becomes the thing that gets fixed
      (proof: test:packages/cli/tests/two-workflows.test.ts)

**Exit condition:** a friction note, written by hand or by a failing tick,
becomes a pull request adding a plan to software factory, amy or logion —
with an exit condition and a line in that repository's `next-steps.md`,
because anything less is refused by that repository's own `sf check` — and
the machine that did it never touched a tracker, never changed the engine,
and stopped opening pull requests once the ceiling was reached.

## Gate criteria carried forward

The installed-workflow gate also retains these assertions from the end-to-end
run; they remain part of this design note so moving the plan cannot discard
what the gate requires:

- `plan.nothing_is_resolved_against_a_tracker`
- `plan.a_refused_draft_goes_back_to_the_agent`
- `plan.nothing_reaches_a_pull_request_until_the_check_is_green`
- `plan.the_plan_carries_an_exit_condition_and_a_place_in_the_order`
- `plan.a_pull_request_is_opened_in_the_repository_the_note_is_about`
- `plan.the_ceiling_is_said_once`
- `plan.a_note_about_another_repository_is_handed_back`
- `plan.a_tick_that_gives_up_leaves_a_note_behind`
- `plan.each_workflow_keeps_its_own_queue_and_records`
- `plan.the_lifecycle_walks_in_order`
- `plan.one_look_makes_at_most_one_move`
- `plan.the_machine_settles_instead_of_spinning`

## What going through the seam found

One defect, and it had been there since the seam was cut: every workflow
runtime's `apply` re-ran `applyPlan`, which the engine had already run. The
contract says so in as many words — "the engine has already folded the state,
the attempt count and the history" — and the first runtime ignored its own
contract. So every retry was counted twice and every move wrote a transition
from a state to itself. A ceiling of three implement attempts was really one
and a half.

Nothing had noticed, because the end-to-end run read the states it observed
rather than the history the record kept, and a doubled attempt count only
shows up as a ceiling arriving sooner than the config says. The second
workflow's run asserted its lifecycle against the record's own history, and
there it was.

## What this deliberately does not do

It does not decide what is worth a plan. The agent proposes and a human
merges, which is the same arrangement every other thing here has: the
machine's judgement is a pull request, not a commit.

It does not write into a fourth repository. Three are the ones this work
already lives in, and a note about anything else is a note the operator gets
told about instead.

It does not run both workflows in one host. `mount()` still claims a single
workflow and that has not changed, so `--workflow` chooses which one this
invocation drives. What is shared is everything that matters: one `.amy`, one
event log and therefore one budget, one handbrake, one notes directory, and
the same engine, queue, store, relay and forge behind both. Only the records
and the queue are per workflow, because two workflows reading each other's
work would be the one thing that genuinely cannot be shared.

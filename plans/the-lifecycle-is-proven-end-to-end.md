# The lifecycle is proven end to end

Every part of this machine was proven on its own, and the machine had never
run.

The plugin gates each prove one artifact: the queue claims an item once, the
relay moves harness after a quota refusal, the installed binary carries its
plugins. The unit suite walks the whole lifecycle as a pure function, with no
tracker, no code host, no repository and no agent anywhere near it. All of
that is worth having, and none of it answers the question somebody actually
has, which is whether a ticket goes in one end and comes out in QA.

The honest next step used to be one real ticket, one move at a time. That is
still the last step, and it is not the one to take first: the first time this
is pointed at a real ticket it will be pointed at real colleagues, a real pull
request and somebody's real quota, and the failures worth finding before then
are not subtle ones.

## What has to be real, and what cannot be

Real: the program. Not a class from `src`, not a plugin imported by a test —
the single executable `scripts/install.sh` produces, run from a directory with
no checkout in it, driven by the commands the README tells an operator to
type. Real git repositories, real clones, real commits, a real push, and a
real gate that is two shell commands against a real file.

Stand-ins: the tracker, the code host and the coding agent. Each is a process
on the other side of the boundary amy already has — GraphQL over a socket, and
two executables named `gh` and `claude` on the `PATH`. So what runs is the
real argv, the real envelope parsing, the real HTTP client and the real
adapters; what is faked is only the part that would otherwise need somebody's
credentials, somebody's quota and somebody's afternoon.

That is the trade, and it is worth naming: this gate cannot prove Linear's
schema is what we think it is, or that Copilot answers to the login we expect.
Those are facts about somebody else's system, they are already written down in
the adapters, and the only thing that settles them is one real ticket. What
this gate proves is everything between the ticket and the handoff — which is
all of the logic, all of the wiring, and all of the ordering.

## Reproducible, or it proves an afternoon

The world is built from scratch in a scratch directory on every run, the
stand-ins are scripted, nothing reaches the internet, and no credential is
involved. The scenario then runs the whole lifecycle **twice, in two separate
worlds, and compares the two trails**, because "it worked once" and "it works"
are different claims and only one of them is worth a gate.

The one thing that is genuinely not deterministic is the day of the week: the
machine refuses to assign a reviewer against a roster nobody confirmed today,
and it does not ask at the weekend, because nobody is there to answer. So the
run asserts that rule against the day it actually runs on, and that assertion
is reported rather than required. Everything the gate requires holds on a
Tuesday and on a Sunday.

## The world it is put to work in

A tracker with three tickets: one in the working status and assigned to the
operator, one in In Review — which the tracker files under the same category
as In Progress — and one in the working status but somebody else's. Two
repositories, because review load counted in one sends every review to
whoever happens to be quiet in that one. Four open reviews already on people's
piles, split across both repositories so that counting either alone picks the
wrong person. A roster nobody has confirmed. A ticket whose description leaves
a question hanging. A gate that stays red until the work is actually right. An
automated reviewer that comments even when it found nothing. A human reviewer
who asks for two changes, one of which the agent refuses. An owner who settles
it.

None of that is decoration. Each one is a line in the README's "things that
look obvious and are wrong", and each one is a way this has already been seen
to break.

## Acceptance criteria

- [x] A ticket in the working status is picked up, and neither the one past
      implementation nor somebody else's is
      (proof: assertion:lifecycle.only_the_working_status_is_picked_up)
- [x] A ticket that leaves a question open gets that question asked on the
      ticket itself
      (proof: assertion:lifecycle.a_blocking_question_is_asked_on_the_ticket)
- [x] The operator is told where to answer, in a file that outlives the
      notification
      (proof: assertion:lifecycle.the_operator_is_told_where_to_answer)
- [x] Every waiting state makes no move at all until somebody else moves
      (proof: assertion:lifecycle.a_waiting_state_makes_no_move_until_the_world_does)
- [x] An answer on the ticket, from somebody other than the machine itself,
      releases the work
      (proof: assertion:lifecycle.the_answer_on_the_ticket_releases_the_work)
- [x] A red gate sends the work back to the agent instead of bouncing between
      the two forever
      (proof: assertion:lifecycle.a_red_gate_sends_the_work_back_to_the_agent)
- [x] The agent's retry carries what the gate actually said, verbatim
      (proof: assertion:lifecycle.the_agent_is_told_what_the_gate_said)
- [x] Nothing reaches a pull request until the gate is green
      (proof: assertion:lifecycle.nothing_reaches_a_pull_request_until_the_gate_is_green)
- [x] What gets pushed is the branch the tracker named, not one derived here
      (proof: assertion:lifecycle.the_branch_the_tracker_named_is_what_gets_pushed)
- [x] The pull request is opened on that branch, against the default branch,
      titled the way the convention says
      (proof: assertion:lifecycle.the_pull_request_is_opened_on_that_branch)
- [x] The automated reviewer's comments are answered before a person is asked
      to look
      (proof: assertion:lifecycle.the_bot_is_answered_before_a_human_is_asked)
- [x] While every reviewer is at the ceiling, the pull request waits with
      nobody assigned and the operator is told once
      (proof: assertion:lifecycle.nobody_is_assigned_while_every_reviewer_is_at_the_ceiling)
- [x] The person asked is the one carrying the fewest open reviews across
      every repository, not across one
      (proof: assertion:lifecycle.review_load_is_counted_across_every_repository)
- [x] A review submitted against an older head does not count as a review of
      the work
      (proof: assertion:lifecycle.a_stale_review_does_not_count)
- [x] After the changes are made, the same reviewer is asked again
      (proof: assertion:lifecycle.a_second_review_is_requested_after_changes)
- [x] A comment the agent refuses to act on becomes a follow-up ticket for the
      owner rather than disappearing
      (proof: assertion:lifecycle.a_disagreement_goes_to_the_owner_as_a_follow_up)
- [x] The owner's answer puts that comment back in front of the agent instead
      of leaving it parked
      (proof: assertion:lifecycle.the_owners_answer_reopens_the_judgement)
- [x] The ticket ends up in the QA status, assigned to whoever the roster says
      owns QA
      (proof: assertion:lifecycle.the_ticket_lands_in_qa_owned_by_qa)
- [x] The states are visited in the order the machine promises, with no state
      skipped and none repeated out of turn
      (proof: assertion:lifecycle.the_ticket_walks_the_lifecycle_in_order)
- [x] One look makes at most one move
      (proof: assertion:lifecycle.one_look_makes_at_most_one_move)
- [x] Once the ticket is handed over, the machine settles instead of spinning
      (proof: assertion:lifecycle.the_machine_settles_instead_of_spinning)
- [x] What the agents spent is read back off the log rather than from a tally
      of its own
      (proof: assertion:lifecycle.what_the_agents_spent_is_read_off_the_log)
- [x] The same run, in a second world, makes exactly the same moves
      (proof: assertion:lifecycle.the_same_run_twice_leaves_the_same_trail)
- [x] The run leaves nothing behind: no world on disk, no child process still
      listening, and no build artefact dropped in the checkout
      (proof: assertion:lifecycle.the_run_leaves_nothing_behind)
- [ ] One real ticket, in the real tracker, with a real reviewer
      (proof: deferred:the stand-ins cannot prove somebody else's schema, and
      this is the step that has to happen with a person watching)

**Exit condition:** `npm run e2e` drives the installed executable through the
whole lifecycle against a world of stand-ins, twice, with no credential and no
network; the `ticket-to-qa` gate carries a sealed manifest whose report shows
those assertions passing; and touching the lifecycle, the engine, the CLI or
any adapter it rests on turns `sf check` red until the run is repeated and
resealed.

What this does not close is the last criterion above. It is the one that needs
a person, and it is cheaper to take once everything above it has already been
shown to hold.

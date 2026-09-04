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
[the engine drives a workflow it does not know](the-engine-drives-a-workflow-it-does-not-know.md),
so a second workflow now costs a `plan()` and a runtime rather than a fork.

This is also what settles that plan's one open criterion. It stays open there
until it is a second workflow really going through the seam, and this is that
workflow — which is the right way round: the proof arrives because something
needed it, not because a checkbox wanted closing.

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
and both workflows mount the same `@amy/plugin-github` behind it. `Gate` does
not move: `run(ticket)` is ticket-shaped, and a plan workflow's check is
`sf check` in a directory rather than a gate over a ticket.

**The harnesses have to be contributed as harnesses.** `contributeTiers`
builds a `HarnessAgent` — the ticket prompts, the branch handling, the commit
— and contributes that. The domain-free unit underneath is
`Harness.ask(prompt, cwd)`, which is what a second workflow wants: its own
prompts over the same ladder, the same budget and the same accounting. So the
harness plugins contribute the harness as well, the relay's ladder moves to
where both can use it, and `@amy/plugin-claude` stops being a plugin only one
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

- [ ] A work item injected by command reaches the queue and is advanced
      without existing in any tracker
      (proof: deferred:the second workflow does not exist yet)
- [ ] A note dropped in the watched directory is picked up by `amy discover`
      alongside anything else that is due
      (proof: deferred:the watched directory does not exist yet)
- [ ] The two workflows run on the same engine, the same queue, the same
      store, the same log and the same budget, with no engine change between
      them (proof: deferred:this is the criterion the other plan is waiting
      on, and it closes here)
- [ ] The forge port is mounted once and used by both workflows
      (proof: deferred:`CodeHost` has not moved to the core yet)
- [ ] A second workflow's agent uses the same harness ladder and the same
      budget as the first, with its own prompts
      (proof: deferred:the harnesses contribute no harness yet)
- [ ] A drafted plan that `sf check` refuses goes back to the agent with the
      finding, rather than reaching a pull request
      (proof: deferred:the workflow does not exist yet)
- [ ] A plan that passes reaches a pull request in the repository it is about,
      naming the friction it came from
      (proof: deferred:the workflow does not exist yet)
- [ ] Past `maxOpenPlansPerRepo`, nothing new is opened and the machine says
      so once (proof: deferred:the ceiling does not exist yet)
- [ ] A tick that fails in the ticket workflow leaves a note behind, so the
      thing that broke becomes the thing that gets fixed
      (proof: deferred:notes cannot be written yet)

**Exit condition:** a friction note, written by hand or by a failing tick,
becomes a pull request adding a plan to software factory, amy or logion —
with an exit condition and a line in that repository's `next-steps.md`,
because anything less is refused by that repository's own `sf check` — and
the machine that did it never touched a tracker, never changed the engine,
and stopped opening pull requests once the ceiling was reached.

## What this deliberately does not do

It does not decide what is worth a plan. The agent proposes and a human
merges, which is the same arrangement every other thing here has: the
machine's judgement is a pull request, not a commit.

It does not write into a fourth repository. Three are the ones this work
already lives in, and a note about anything else is a note the operator gets
told about instead.

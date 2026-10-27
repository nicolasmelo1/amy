# A conversation before the work

Deciding what to build is a conversation: a person asks, the agent answers,
the person asks again, and nothing is executed until both are done. amy has
no place for that. Its only conversation is a work thread whose replies are
answers (*a question is not an answer* fixes that half), and its only agent
call, `Harness.ask` (`packages/core/src/ports/Harness.ts:53`), is one prompt
and one reply.

The window is where this conversation belongs, and it is two different
conversations that must never be confused:

- **Asking.** "What is happening here?", "why did the gate go red?", "help me
  write this ticket". It moves nothing, writes nothing, and can happen about
  anything at any time.
- **Discussing with the work.** The thread of a record that is waiting on its
  owner. It ends in a decision, and the decision moves the work.

## What changes

**`⌘K` opens an ask, from anywhere in the window.** It is about whatever is
selected: the record, its checkout and its brief are the context, and the
directory it runs in is the record's worktree or, with nothing selected, the
configured base snapshot. A person picks the harness from those contributed to
the `harness` collection — the ones the relay already climbs. It runs with
nothing that writes: no commit, no push, no port that mutates.

**An ask has turns.** Each turn sends the transcript so far with the new
message, which every harness understands. A harness that can resume its own
session may say so and be sent only the new message, but the transcript stays
the source of truth, so changing harness mid-conversation works.

**Asks are kept**, one file per conversation under the state directory, and
`⌘K` lists the recent ones. Nothing in them reaches a tracker or a thread
unless a person copies it there.

**The work thread opens in the right panel**, beside the record, whenever the
record is waiting on its owner. It reads and posts through the mounted
`conversation` port, so the window and Slack show the same thread and neither
is a copy. Its composer says which conversation it is — "discussing with
TKT-11" — and has the decision as a separate button, never the default of
pressing enter. With no conversation port mounted, the window mounts its own.

## The gates

`ui-window` gains the two conversations. The conformance world's conversation
port is a fake Slack whose call log the scenario reads, and its harnesses are
fake CLIs that record the prompt they were given, so what an ask carried is a
fact a test reads rather than a property of a model.

## Acceptance criteria

- [ ] `mod+k` opens the ask in every renderer, and escape closes it
      (proof: deferred:assertion:frame.every_key_does_what_it_is_declared_to)
- [ ] Enter in the thread panel posts a discussion turn, never a decision, in
      every renderer (proof: deferred:assertion:frame.every_key_does_what_it_is_declared_to)
- [ ] An ask runs with no mutating port reachable, and a harness that tries to
      commit is refused (proof: deferred:assertion:window.an_ask_writes_nothing)
- [ ] The third turn of an ask carries the first two, and after switching
      harness at the third the new harness is given them
      (proof: deferred:assertion:window.an_ask_carries_its_turns_across_harnesses)
- [ ] An ask about a record runs in that record's worktree
      (proof: deferred:assertion:window.an_ask_runs_where_its_record_is)
- [ ] A message sent from the panel is in the fake Slack's call log, and one
      Slack delivers is in the panel (proof: deferred:assertion:window.the_thread_is_one_thread)
- [ ] The record moves on the decision and not before
      (proof: deferred:assertion:window.only_a_decision_moves_the_work)

**Exit condition:** a person asks four questions about an escalated record in
`mod+k` on one harness and a fifth on another, then discusses it in the thread
panel, decides, and the record moves only at the decision.

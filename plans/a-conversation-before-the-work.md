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
record is waiting on its owner. Its composer says which conversation it is —
"discussing with TKT-11" — and has the decision as a separate button, never
the default of pressing enter. A turn from the panel is always marked, so it
reads as what the person pressed under either `policy.conversation`
(*a question is not an answer*).

The `conversation` port as it stands cannot carry this, in either direction.
`post` writes as amy's own account, and `replies` keeps only the operator's
messages and drops everything amy wrote
(`isOperatorAnswer` in `plugins/slack/src/SlackConversation.ts`). So a turn the
panel posted through `post` would never reach the daemon as the operator's,
and the panel reading through `replies` would never show the agent's answers.
The port gains two members:

```ts
submit(thread: ThreadRef, turn: { text: string; kind: "discussion" | "decision"; author: string }): Promise<string>;
transcript(thread: ThreadRef, since?: string): Promise<{ at: string; from: "operator" | "amy"; author: string; text: string; kind?: "discussion" | "decision" }[]>;
```

`submit` is a turn the operator made **through amy**. The Slack adapter posts
it as the bot — the only account amy writes with — carrying message metadata
of its own event type with the kind and the author, and `replies` returns a
bot message only when it carries that event type. The metadata is a marker,
not the authentication: any member of a workspace can read message metadata,
so what makes a submitted turn the operator's is that only amy holds the bot
token and only the window host, behind its token, calls `submit`. Every other
message amy wrote stays excluded, as today. `transcript` is every message in
the thread, attributed, which is what the panel draws.

**Without Slack, the conversation is a plugin, not the window.** The window
and the daemon are two processes, and the daemon reads answers only through
the `conversation` port it mounted at start — without one, `answersFor` reads
the tracker (`packages/workflow-ticket-to-qa/src/runtime.ts:244`). A thread the
window kept for itself would be a thread the daemon never reads. So this row
ships `@amykit/plugin-file-conversation`: one file per thread under the state
directory, written by rename like the queue, mounted from `config.yaml` like
any port. Both processes assemble the same profile, so both mount the same
plugin and read the same files. It implements all of the port, `submit` and
`transcript` included.

The daemon mounts once, at start, and nothing restarts it when the config
changes. The window compares the running loop's start with the config it
read: when the conversation the window would use is not the one the loop
mounted — none at all, or a different one — the panel says the loop has to be
restarted for an answer to reach the work, and offers no decision until it
has. With no conversation port mounted anywhere, the panel is read-only and
names the plugin that would give it one.

## The gates

`submit` and `transcript` are new port members, so they go through *no port
method ships unproven* on arrival, and the Slack adapter's half is proven
against Slack's recorded answers, not against a fake: a fake call log shows
that the window called the port, not that the adapter turns it into the
operator's reply. `ui-window` gains the two conversations. The conformance world's conversation
port is a fake Slack whose call log the scenario reads, and its harnesses are
fake CLIs that record the prompt they were given, so what an ask carried is a
fact a test reads rather than a property of a model.

## Acceptance criteria

- [ ] `mod+k` opens the ask in every renderer, and escape closes it
      (proof: deferred:assertion:frame.every_key_does_what_it_is_declared_to)
- [ ] Enter in the thread panel posts a discussion turn, never a decision, in
      every renderer (proof: deferred:assertion:frame.every_key_does_what_it_is_declared_to)
- [ ] A decision submitted through the Slack adapter comes back from
      `replies` as the operator's decision, and a message amy posted with
      `post` still does not (proof: deferred:test:plugins/slack/tests/SlackConversation.test.ts)
- [ ] `transcript` returns the operator's turns and amy's answers, attributed,
      in order (proof: deferred:test:plugins/slack/tests/SlackConversation.test.ts)
- [ ] A discussion turn from the panel is answered in the thread and moves
      nothing, under `answer` as under `discuss`
      (proof: deferred:assertion:window.a_discussion_from_the_window_moves_nothing)
- [ ] An ask runs with no mutating port reachable, and a harness that tries to
      commit is refused (proof: deferred:assertion:window.an_ask_writes_nothing)
- [ ] The third turn of an ask carries the first two, and after switching
      harness at the third the new harness is given them
      (proof: deferred:assertion:window.an_ask_carries_its_turns_across_harnesses)
- [ ] An ask about a record runs in that record's worktree
      (proof: deferred:assertion:window.an_ask_runs_where_its_record_is)
- [ ] A turn sent from the panel is in the Slack thread, and one the operator
      writes in Slack is in the panel, both through the installed Slack
      adapter (proof: deferred:assertion:window.the_thread_is_one_thread)
- [ ] With only `plugin-file-conversation` mounted, a decision pressed in the
      panel resumes the record in the running daemon, and a discussion turn
      does not (proof: deferred:assertion:window.a_decision_without_slack_resumes_the_record)
- [ ] A loop started before its conversation plugin was mounted makes the
      panel say it must restart, and offer no decision
      (proof: deferred:assertion:window.a_stale_loop_is_named_not_answered)
- [ ] A decision pressed in the panel reaches the daemon through the Slack
      adapter, and the record moves on it and not before
      (proof: deferred:assertion:window.only_a_decision_moves_the_work)

**Exit condition:** a person asks four questions about an escalated record in
`mod+k` on one harness and a fifth on another, then discusses it in the thread
panel, decides, and the record moves only at the decision.

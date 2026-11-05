---
sources:
  - { id: S1, kind: code, ref: "packages/core/src/ports/Harness.ts", said: "Harness.ask is one prompt and one reply; amy's only conversation is a work thread whose replies are answers" }
  - { id: S2, kind: reference, ref: "docs/design/a-question-is-not-an-answer.md", said: "a thread reply is a discussion turn or a decision, read under policy.conversation (answer or discuss)" }
  - { id: S3, kind: decision, said: "two conversations, never confused: asking moves and writes nothing, about anything, any time; discussing with the work is a waiting record's thread, ending in a decision that moves the work" }
  - { id: S4, kind: decision, said: "mod+k opens an ask from anywhere in the window, about the selection: the record, its checkout, its brief, each move's evidence and the kept agent runs — the context amy ask starts from" }
  - { id: S5, kind: reference, ref: "plans/an-escalation-brings-its-evidence.md", said: "stores the evidence of each move and the kept agent runs an ask reads" }
  - { id: S6, kind: decision, said: "an ask runs on the window's own server, with a harness its relay climbs, whichever server the record lives on; with nothing selected, in the configured base snapshot. The person picks the harness" }
  - { id: S7, kind: decision, said: "an ask runs with nothing that writes: no commit, no push, no mutating port" }
  - { id: S8, kind: decision, said: "each turn sends the transcript so far with the new message; a harness able to resume its session may get only the new message, but the transcript stays the truth, so switching harness works" }
  - { id: S9, kind: decision, said: "asks are kept one file per conversation under the state directory, the files and format amy ask already writes; mod+k lists recent ones, whichever started them" }
  - { id: S10, kind: decision, said: "the work thread opens in the right panel beside a record waiting on its owner; the composer says 'discussing with TKT-11'; the decision is a separate button, never enter's default" }
  - { id: S11, kind: decision, said: "a turn from the panel is always marked, so it reads as what the person pressed under either policy.conversation" }
  - { id: S12, kind: code, ref: "plugins/slack/src/SlackConversation.ts", said: "post writes as amy's account and replies keeps only the operator's messages (isOperatorAnswer), so a panel turn via post never reaches the daemon and replies never shows amy's answers" }
  - { id: S13, kind: decision, said: "the conversation port gains submit(thread: ThreadRef, turn: { text: string; kind: \"discussion\" | \"decision\"; author: string }): Promise<string> — a turn the operator made through amy" }
  - { id: S14, kind: decision, said: "and transcript(thread: ThreadRef, since?: string): Promise<{ at; from: \"operator\" | \"amy\"; author; text; kind?: \"discussion\" | \"decision\" }[]> — every message in the thread, attributed" }
  - { id: S15, kind: decision, said: "Slack posts a submitted turn as the bot with message metadata of its own event type carrying kind and author; replies returns a bot message only with that event type; every other amy message stays excluded" }
  - { id: S16, kind: decision, said: "metadata is a marker, not authentication: any workspace member reads it; a submitted turn is the operator's because only amy holds the bot token and only the server calls submit, for a client with its token" }
  - { id: S17, kind: reference, ref: "plans/the-window-is-served.md", said: "the server is the only caller of submit, for a client that presented the server's token" }
  - { id: S18, kind: code, ref: "packages/workflow-ticket-to-qa/src/runtime.ts", said: "window and daemon are two processes; the daemon reads answers only through the conversation port mounted at start, else answersFor reads the tracker" }
  - { id: S19, kind: decision, said: "ships @amykit/plugin-file-conversation: one file per thread under the state directory, written by rename like the queue, mounted from config.yaml; implements the whole port, submit and transcript included" }
  - { id: S20, kind: decision, said: "both processes assemble the same profile, so both mount the same plugin and read the same files" }
  - { id: S21, kind: decision, said: "the daemon mounts once and no config change restarts it; the window compares the loop's start with the config it read" }
  - { id: S22, kind: reference, ref: "docs/design/no-port-method-ships-unproven.md", said: "submit and transcript pass it on arrival; the Slack half is proven against Slack's recorded answers, since a fake call log only shows the window called the port" }
  - { id: S23, kind: decision, said: "ui-window gains the two conversations; its world's conversation port is a fake Slack whose call log the scenario reads, and its harnesses fake CLIs recording the prompt given" }
  - { id: S24, kind: reference, ref: "plans/every-endpoint-is-named-before-it-is-built.md", said: "this row delivers domains asks and threads — listHarnesses, startAsk, listAsks, getAsk, addAskTurn, getThread, addThreadTurn — and views work.thread, asks.recent" }
  - { id: S25, kind: decision, said: "those are flipped to delivered in surface.yaml in the same pull request" }
  - { id: S26, kind: decision, said: "an ask about this server's record runs in its worktree; about another server's, in this machine's checkout of that repository at the branch that server pushed. Decided 2026-11-03" }
  - { id: S27, kind: decision, said: "with no checkout of its repository here, the ask reads that record's history, evidence, kept runs and diff through its server's API, as text, and says it has no code to read" }
  - { id: S28, kind: reference, ref: "plans/the-window-is-served.md", said: "a server never runs an agent for a paired device: the machine asking is the one whose harness answers, so connecting two amys never lends one's agents, or shell, to the other" }
  - { id: S29, kind: decision, said: "a discussion turn is answered by an agent, so one from a paired device is refused; its decisions still move the work, since a decision runs no agent" }
  - { id: S30, kind: decision, said: "with the repository here but the record's branch not yet pushed, the ask runs in this checkout at the base branch, is handed the record's diff from its server, and says the code it reads is the base's" }
  - { id: S31, kind: reference, ref: "plans/a-question-carries-its-answers.md", said: "an ask shows its answers as buttons in the thread panel, choices with a send; a press submits the answer through the port as a decision; an answered ask shows the answer taken, no buttons. Decided 2026-11-05" }
touches:
  - packages/core/src/ports/Conversation.ts
  - plugins/slack/src/SlackConversation.ts
  - plugins/slack/tests/SlackConversation.test.ts
  - plugins/file-conversation/**
  - packages/server/surface.yaml
  - packages/server/src/**
  - packages/ui/**
  - packages/ui-conformance/**
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "what this row delivers is delivered in surface.yaml, and the surface gate is green", proof: "deferred:test:packages/server/tests/surface.test.ts", sources: [S24, S25] }
  - { id: A2, statement: "mod+k opens the ask in every renderer, and escape closes it", proof: "deferred:assertion:frame.every_key_does_what_it_is_declared_to", sources: [S4] }
  - { id: A3, statement: "enter in the thread panel posts a discussion turn, never a decision, in every renderer", proof: "deferred:assertion:frame.every_key_does_what_it_is_declared_to", sources: [S10] }
  - { id: A4, statement: "a decision submitted through the Slack adapter comes back from replies as the operator's decision, and a message amy posted with post still does not", proof: "deferred:test:plugins/slack/tests/SlackConversation.test.ts", sources: [S12, S13, S15, S16, S17, S22] }
  - { id: A5, statement: "transcript returns the operator's turns and amy's answers, attributed, in order", proof: "deferred:test:plugins/slack/tests/SlackConversation.test.ts", sources: [S14, S22] }
  - { id: A6, statement: "a discussion turn from the panel is answered in the thread and moves nothing, under answer as under discuss", proof: "deferred:assertion:window.a_discussion_from_the_window_moves_nothing", sources: [S2, S3, S11, S23] }
  - { id: A7, statement: "an ask runs with no mutating port reachable, and a harness that tries to commit is refused", proof: "deferred:assertion:window.an_ask_writes_nothing", sources: [S1, S3, S7, S9, S23] }
  - { id: A8, statement: "the third turn of an ask carries the first two, and after switching harness at the third the new harness is given them", proof: "deferred:assertion:window.an_ask_carries_its_turns_across_harnesses", sources: [S8, S23] }
  - { id: A9, statement: "an ask about a record of this server runs in that record's worktree", proof: "deferred:assertion:window.an_ask_runs_where_its_record_is", sources: [S4, S5, S6, S26] }
  - { id: A14, statement: "an ask about another server's TBO-1 runs on this machine's harness, in its checkout at the branch that server pushed, while this server also has a TBO-1, and that server records no agent run", proof: "deferred:assertion:window.an_ask_about_another_server_runs_here", sources: [S6, S26, S28] }
  - { id: A15, statement: "with no checkout of the record's repository here, the ask is given that record's history, evidence and diff from its server's API, and says it has no code", proof: "deferred:assertion:window.an_ask_without_the_code_reads_the_record", sources: [S27] }
  - { id: A16, statement: "a discussion turn from a paired device is refused and no agent runs on the host, while its decision moves the waiting record", proof: "deferred:assertion:window.a_remote_discussion_runs_no_agent", sources: [S28, S29] }
  - { id: A17, statement: "an ask about another server's record before its first push runs here at the base branch, is given the record's diff from its server, and says so", proof: "deferred:assertion:window.an_ask_before_the_push_reads_the_base", sources: [S26, S27, S30] }
  - { id: A18, statement: "an ask in the work thread is buttons in the thread panel in every renderer, a press moves the waiting record as a decision, and the same ask answered in Slack first shows as answered with no buttons", proof: "deferred:assertion:window.an_ask_is_answered_by_a_press", sources: [S31] }
  - { id: A10, statement: "a turn sent from the panel is in the Slack thread, and one the operator writes in Slack is in the panel, both through the installed Slack adapter", proof: "deferred:assertion:window.the_thread_is_one_thread", sources: [S13, S14, S15] }
  - { id: A11, statement: "with only plugin-file-conversation mounted, a decision pressed in the panel resumes the record in the running daemon, and a discussion turn does not", proof: "deferred:assertion:window.a_decision_without_slack_resumes_the_record", sources: [S18, S19, S20] }
  - { id: A12, statement: "a loop started before its conversation plugin was mounted makes the panel say it must restart, and offer no decision", proof: "deferred:assertion:window.a_stale_loop_is_named_not_answered", sources: [S21] }
  - { id: A13, statement: "a decision pressed in the panel reaches the daemon through the Slack adapter, and the record moves on it and not before", proof: "deferred:assertion:window.only_a_decision_moves_the_work", sources: [S3, S10, S15] }
crosses:
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "Conversation.ts gains read and submit members on the thread; no tracker or code-host write is added" }
  - { mechanism: events-and-notifications, answer: works, proof: "deferred:A4, A10, A13" }
  - { mechanism: rendering, answer: works, proof: "deferred:A2, A3" }
guarantee:
  - { holds: "an ask writes nothing: no commit, push, mutating port, tracker or thread", not_against: "a person copying its text there by hand" }
  - { holds: "a submitted turn is the operator's only because amy alone holds the bot token and only the server calls submit", not_against: "any workspace member reading message metadata" }
failures:
  - { step: panel, when: "the conversation the window would use is not the one the running loop mounted (none, or another)", goes_to: "the panel says the loop must restart for an answer to reach the work, and offers no decision" }
  - { step: panel, when: "no conversation port is mounted anywhere", goes_to: "read-only panel naming the plugin that would give it one" }
  - { step: ask, when: "a harness tries to commit", goes_to: refused }
cut:
  - "a thread the window keeps for itself: the daemon would never read it"
  - "message metadata as authentication"
  - "the decision as enter's default"
  - "ask text reaching a tracker or thread without a person copying it"
exit: "a person asks four questions about an escalated record in mod+k on one harness and a fifth on another, then discusses it in the thread panel, decides, and the record moves only at the decision"
---
# A conversation before the work

Deciding what to build is a conversation — ask, answer, ask again, execute nothing
until done — and amy has no place for it: one thread whose replies are answers,
and one agent call that is one prompt and one reply.

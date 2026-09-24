# An answer arrives where the question was asked

Filed as #84.

Every answer amy can hear arrives as a tracker comment.
[An answer reaches the agent](../docs/design/an-answer-reaches-the-agent.md)
made that work, and it is the only road: `CLARIFYING` reads
`tracker.comments`, `ESCALATED` reads `tracker.hasReplyAfter`, and the inbox
channel ends every file it writes with *"Answer on the ticket, then delete this
file"* (`plugins/notify-inbox/src/inboxChannel.ts`). The notifier is one-way:
`Announcement` is `{text, workId, state, kind}`
(`packages/core/src/ports/Notifier.ts`) and `FanOutNotifier` delivers it to
every contributed channel with no destination and nothing coming back.

That welds together two things that are separate: where the *work* lives and
where the *operator* talks to the machine. An install whose operator wants the
tracker left alone — nothing posted there, nothing read back as an answer —
cannot be asked a question at all.

## What changes

A `conversation` port in the core:

```ts
interface Conversation {
  /** The thread for one piece of work, created on first use and remembered. */
  open(workId: string, title: string): Promise<ThreadRef>;
  post(thread: ThreadRef, message: { text: string; files?: string[] }): Promise<string>;
  /** Replies by the operator after `since`, oldest first. Files are local paths. */
  replies(thread: ThreadRef, since: string): Promise<Reply[]>;
}
interface Reply { at: string; author: string; text: string; files: string[] }
```

- **One thread per piece of work.** An answer is never ambiguous about which
  question it answers, because the thread *is* the work item. Two items
  waiting at once are two threads.
- **A reply carries files.** A screenshot is an answer as often as a sentence
  is; the adapter downloads it and hands back a path an agent can read.
- **An announcement about a piece of work goes into its thread** when a
  `conversation` port is mounted, so an escalation and its answer sit
  together. An engine failure with no work item keeps going to the channels
  it goes to today.
- **A workflow says where it listens.** `ask-question` and the escalation path
  read `conversation.replies` when the workflow declares it, and the tracker
  otherwise. An install that mounts no conversation changes in nothing.
- **The inbox footer stops assuming the ticket.** It names where the answer is
  expected.

## Ordering

After [no port method ships unproven](no-port-method-ships-unproven.md): this
is a new port, and its methods should have to get past that guardrail on
arrival rather than be its next counterexample.

## The gate

The port and the announcement routing are proved in
`packages/core/tests/ports.test.ts` and
`plugins/notify-fanout/tests/FanOutNotifier.test.ts`; the answer path is proved
through `ticket-to-qa`, the shipped workflow that asks questions, against a
scripted conversation.

## Acceptance criteria

- [ ] A shipped workflow asks a question, receives a text-and-image reply
      through a scripted conversation, and resumes, with no tracker write
      method called (proof: test:packages/workflow-ticket-to-qa/tests/plugin.test.ts)
- [ ] A reply in one work item's thread does not answer another's
      (proof: test:packages/workflow-ticket-to-qa/tests/plugin.test.ts)
- [ ] An announcement for a work item is delivered into its thread when a
      conversation is mounted, and to the channels otherwise
      (proof: test:plugins/notify-fanout/tests/FanOutNotifier.test.ts)
- [ ] The inbox footer names where the answer is expected
      (proof: test:plugins/notify-inbox/tests/inboxChannel.test.ts)

**Exit condition:** a workflow can ask its operator a question and hear the
answer, text and pictures, without the tracker being written to or read for it.

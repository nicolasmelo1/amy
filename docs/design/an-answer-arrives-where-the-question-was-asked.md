# An answer arrives where the question was asked

Delivered. A conversation is a core port with a thread per work item. The
adapter owns the durable thread reference, so a workflow opens the same thread
when it asks and when it later reads replies.

## What changed

`Conversation` carries `open`, `post` and `replies`. A reply has attributed
text, its instant and local paths for downloaded files. `ticket-to-qa` declares
that it listens to the optional port: with one mounted it posts questions and
reads replies from the work thread; without one it preserves the tracker road.
Files are rendered into the conversation that goes back to triage, so the agent
can read the local path.

`FanOutNotifier` routes an announcement with a work id into that same thread
when a conversation exists. Without a conversation it still delivers to every
contributed channel. The inbox channel is only part of that fallback, so its
footer directs the operator to answer on the ticket.

## Acceptance criteria

- [x] The core exports the `Conversation` contract shared by a workflow and
      adapter (proof: test:packages/core/tests/ports.test.ts)
- [x] An announcement for a work item is delivered into its thread when a
      conversation is mounted, and to channels otherwise
      (proof: test:plugins/notify-fanout/tests/FanOutNotifier.test.ts)
- [x] The inbox footer names where the answer is expected
      (proof: test:plugins/notify-inbox/tests/inboxChannel.test.ts)
- [x] A workflow keeps its tracker answer path when no conversation port is
      mounted (proof: test:packages/workflow-ticket-to-qa/tests/briefs.test.ts)

**Exit condition:** a workflow can ask its operator a question and hear the
answer, text and pictures, without the tracker being written to or read for it.

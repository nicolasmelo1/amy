# A review thread can be replied to

`CodeHost` has five methods
(`packages/core/src/ports/CodeHost.ts:127`): find, open, request review,
count load, list requested. None of them writes a word on a pull
request. The machine can open a thread's objection, judge it, fix the
code — and it cannot say one sentence back inside the thread the
objection came in.

Every answer amy owes a reviewer is therefore an action at a distance:
fix the code and push, or escalate to the owner
(`packages/workflow-ticket-to-qa/src/machine.ts:303`), with no way to
reply "this is intentional, see the ticket" where the reviewer asked
it. A review that is a misunderstanding costs an executor run to not
fix anything; a deferred objection cannot be recorded as answered; and
the strong model that reads a review first
([a-strong-model-reads-the-review-first.md](a-strong-model-reads-the-review-first.md))
has an `answer` verdict with nowhere to put it.

This was found on the Revv workflow (issue #49), but no workflow is
exempt: any workflow that answers reviews — which is every workflow
that runs `address-threads` — needs the same write, and today each
would escalate where a reply would do.

## What changes

**The port grows the reply.** `CodeHost` gains:

```ts
/** Replies inside a review thread, once per call. */
replyToReviewThread(threadId: string, body: string): Promise<void>;
```

`ReviewThread.id` is already the GraphQL node id — the adapter maps
`id: thread.id` (`plugins/github/src/GitHubCodeHost.ts:326`) — so the
caller has everything it needs and the mutation is one call:

```sh
gh api graphql -f query='mutation Reply($id: ID!) {
  addPullRequestReviewThreadReply(input: {threadID: $id, body: "..."}) {
    thread { id comments(first: 1) { nodes { databaseId } } }
  }
}'
```

An implementor that cannot reply — a forge with no thread concept —
throws, and the action fails the way every unmet need fails: named,
at boot, by the workflow that used it.

**`CORE_ACTIONS` grows `reply-review-thread`.** One entry,
`{ port: "code-host", method: "replyToReviewThread" }`
(`packages/core/src/actions.ts:21`), so a workflow emits it the way it
emits `resolve-review-thread`
([the-threads-close-when-they-are-answered.md](the-threads-close-when-they-are-answered.md))
and a mount that cannot run it is refused at boot by name.

**The reply is data, not prose policy.** Who may reply, and what the
reply says, is workflow policy — the same line the thread-closing plan
draws. The port only has to make the write possible, and the action
catalogue only has to name it.

## The gate

`ticket-to-qa`, extended — the lifecycle is where a reply lands:

- `thread.a_reply_lands_inside_the_thread_it_answers`
- `thread.a_reply_reaches_the_thread_conversation_on_the_next_look`
- `thread.a_thread_with_no_open_objection_is_not_replied_to`

## Acceptance criteria

- [ ] `replyToReviewThread` writes a reply inside a thread by its id in
      one call (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [ ] The core dispatches `reply-review-thread` to the code-host port
      (proof: test:packages/workflow-ticket-to-qa/tests/plugin.test.ts)
- [ ] A reply appears in the thread's conversation on the next
      observation (proof: assertion:thread.a_reply_reaches_the_thread_conversation_on_the_next_look)
- [ ] A mount without the code-host port refuses a workflow using the
      action, by name, at boot
      (proof: test:packages/core/tests/mount.test.ts)

**Exit condition:** a workflow that owes a reviewer an answer can write
it where the reviewer asked it, and the next look reads it back as
part of the conversation.
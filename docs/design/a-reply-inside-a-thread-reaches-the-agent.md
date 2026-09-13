# A reply inside a thread reaches the agent

Delivered. The record of this decision is this document; what proves it is
the unit suite — the GitHub adapter's tests are checked against what GitHub
actually sends, and the agent-kit tests read what the fake harness was
asked. The plan that came before kept the argument; what it promised is the
acceptance criteria at the end.

## What was wrong

`ReviewThread` carried the first comment of a thread and nothing that
followed it (`packages/core/src/ports/CodeHost.ts:13`). `GitHubCodeHost`
asked for one comment per thread — `comments(first: 1)` — and mapped
`author: first.author.login, body: first.body`
(`plugins/github/src/GitHubCodeHost.ts:56`). So a thread whose author
replied twice, or whose *reviewer* replied to the machine's answer, read
exactly like one nobody has touched since it was opened.

Three things followed, and each was a silent wrong answer rather than an
error:

- **An agent answering a thread never saw the correction inside it.** It was
  handed the opening comment and told to address it, while the reply saying
  "no, not like that" sat one field away.
- **Whose turn it is was undecidable.** A workflow could not tell a thread
  nobody had answered from one it answered and was waiting on, because both
  had the same first comment.
- **Anything that told the machine's own writing from a person's read the
  wrong comment** — it was asking about the opening one, whoever wrote the
  rest.

The cost was not hypothetical. `address-threads` handed the agent each
thread's `body` (`packages/agent-kit/src/HarnessAgent.ts:210`), so the agent
answered what the thread *started* with; a correction arriving inside the
thread was answered the same way the original was, or judged a disagreement
it never was, and went to the owner as noise.

## What changed

`ReviewThread` grew the conversation, oldest first:

```ts
export interface ReviewThread {
  id: string;
  author: string;          // the opening comment's, as today
  body: string;            // the opening comment's, as today
  isResolved: boolean;
  isOutdated: boolean;
  comments: { author: string; body: string; createdAt: string }[];
}
```

`author` and `body` staying the opening comment's is what keeps every
existing consumer working: `unresolvedThreads` decides what a thread is
*about* by who opened it (`packages/workflow-ticket-to-qa/src/review.ts`),
and that question has not changed.

The query asks for `comments(first: 50)` with `createdAt` — the same node
in the same request, so it costs nothing extra — and the adapter maps the
list. `comments.at(-1).author` answers whose turn it is from the view alone,
which until now was a question the port could not answer.

The prompt half: `threadPrompt` renders the conversation, attributed — the
opening comment stays the header a thread is introduced by, and each later
comment is a bullet naming who replied — and says that a later comment in a
thread answers the earlier ones, with the last comment naming who the thread
is waiting on. An agent handed a correction inside the thread is handed the
correction.

## Acceptance criteria

- [x] A reply inside a thread reaches every consumer of the view
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [x] `author` and `body` remain the opening comment's, so a consumer that
      never asked for the conversation is unaffected
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [x] The comments arrive oldest first
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [x] The last comment's author answers who speaks next in a thread,
      without fetching anything the view did not already carry
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [x] The prompt an agent receives shows the whole conversation, attributed
      (proof: test:packages/agent-kit/tests/HarnessAgent.test.ts)
- [x] A prompt never presents a reply as part of the original objection
      (proof: test:packages/agent-kit/tests/HarnessAgent.test.ts)

**Exit condition:** a reply written inside a thread is read by the agent
answering that thread, and a workflow can tell whose turn a thread is from
the view alone. The first half is the adapter carrying the whole
conversation and the prompt rendering it attributed and in order; the
second is `comments.at(-1)?.author` read off the view, with no second call.
# A reply inside a thread reaches the agent

`ReviewThread` carries the first comment of a thread and nothing that
followed it (`packages/core/src/ports/CodeHost.ts:13`). `GitHubCodeHost`
asks for one comment per thread:

```graphql
reviewThreads(first: 100) {
  nodes { id isResolved isOutdated comments(first: 1) { nodes { author { login } body } } }
}
```

(`plugins/github/src/GitHubCodeHost.ts:56`) and maps `author: first.author.login,
body: first.body` (`:326`). So a thread whose author replied twice, or whose
*reviewer* replied to the machine's answer, reads exactly like one nobody
has touched since it was opened.

Three things follow, and each is a silent wrong answer rather than an error:

- **An agent answering a thread never sees the correction inside it.** It is
  handed the opening comment and told to address it, while the reply saying
  "no, not like that" sits one field away.
- **Whose turn it is is undecidable.** A workflow cannot tell a thread
  nobody has answered from one it answered and is waiting on, because both
  have the same first comment.
- **Anything that tells the machine's own writing from a person's reads the
  wrong comment** — it is asking about the opening one, whoever wrote the
  rest.

## How it was found

Reviewing a machine's pull requests the way a person actually reviews: by
replying inside the thread the machine opened rather than starting a new
one. The reply never reached the agent, and could not have — the port does
not carry it.

The cost is not hypothetical. `address-threads` hands the agent each
thread's `body` (`packages/agent-kit/src/HarnessAgent.ts:210`), so the agent
answers what the thread *started* with; a correction arriving inside the
thread is answered the same way the original was, or judged a disagreement
it never was, and goes to the owner as noise.

## What changes

`ReviewThread` grows the conversation, oldest first:

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
which today is a question the port cannot answer.

The prompt half: `threadPrompt` renders the conversation, attributed, and
says that a later comment in the same thread answers an earlier one. An
agent handed a correction inside the thread is handed the correction.

## The gate

`plugins/github/tests/GitHubCodeHost.test.ts` already maps a real answer
from a real pull request; its threads grow replies inside them, so the
mapping is checked against what GitHub actually sends. `agent-kit` asserts
the prompt: the fixture records what the fake harness was asked.

## Acceptance criteria

- [ ] A reply inside a thread reaches every consumer of the view
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [ ] `author` and `body` remain the opening comment's, so a consumer that
      never asked for the conversation is unaffected
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [ ] The comments arrive oldest first
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [ ] The last comment's author answers who speaks next in a thread,
      without fetching anything the view did not already carry
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [ ] The prompt an agent receives shows the whole conversation, attributed
      (proof: test:packages/agent-kit/tests/HarnessAgent.test.ts)
- [ ] A prompt never presents a reply as part of the original objection
      (proof: test:packages/agent-kit/tests/HarnessAgent.test.ts)

**Exit condition:** a reply written inside a thread is read by the agent
answering that thread, and a workflow can tell whose turn a thread is from
the view alone.
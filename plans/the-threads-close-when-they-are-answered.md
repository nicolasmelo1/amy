# The threads close when they are answered

GitHub resolves nothing by itself. A thread stays open after the code that
answers it is pushed; someone has to say it is settled. `CodeHost` mounts
five methods (`packages/core/src/ports/CodeHost.ts:127`) and none of them
closes a thread — so a workflow state whose exit is "no thread is
unresolved" has an exit no effect it can emit will ever bring about.

What such a state does instead, on a real board, is this:

1. send an agent to fix the code,
2. look again, see the same open thread,
3. count an attempt, and repeat until the ceiling.

The escalation it then writes is *"the automated threads were not resolved
in three attempts"* — literally true, and it reads as the agent failing at
the work rather than as a missing button. Three tickets on one install did
exactly that, having had their code fixed each round:

```
TBO-1241  attempts {"COPILOT_FIX": 3}  the automated threads were not resolved in three attempts
TBO-1242  attempts {"COPILOT_FIX": 3}  idem
TBO-1243  attempts {"COPILOT_FIX": 3}  idem
```

The same shape is one state away here: `COPILOT_FIX` exits when every
automated thread has been judged
(`packages/workflow-ticket-to-qa/src/machine.ts:239`), and a judged thread
is one the record has an opinion about — not one the forge agrees is
settled.

## What changes

```ts
resolveReviewThread(threadId: string): Promise<void>
unresolveReviewThread(threadId: string): Promise<void>
```

`ReviewThread.id` is already the GraphQL node id — `GitHubCodeHost` maps
`id: thread.id` — so the caller has everything it needs and the mutation is
one call, verified against the API:

```sh
gh api graphql -f query='mutation Resolve($id: ID!) {
  resolveReviewThread(input: {threadId: $id}) { thread { id isResolved } }
}' -F id=<threadId>
```

`unresolveReviewThread` mounts beside it: a machine that closed a thread on
a fix that later got reverted should be able to put it back.

The action catalogue grows one entry,
`"resolve-review-thread": { port: "code-host", method: "resolveReviewThread" }`,
so a workflow emits it the way it emits `open-pull-request`, and a mount
that cannot run it is refused at boot by name.

**Who may close what is the workflow's policy, not the port's.** This
machine closes the automated reviewer's threads once it has answered them,
and never a colleague's — only the author of an objection decides it is
settled, so a human thread stays open for the human to close, and `HUMAN_FIX`
does not emit the effect at all. The port only has to make it possible.

The move, inside `COPILOT_FIX`: threads the record already judged `fixed`
and the forge still holds open get one act of `resolve-review-thread`
effects; the next look sees them resolved and the state leaves the way its
exit condition says it does.

## The gate

The adapter test asserts the argv against the scripted runner — the
mutation, the variable, one call. The machine tests drive the decision
purely, as every state here is driven, and the walkthrough proves the
lifecycle: a ticket that would have escalated at the ceiling now leaves
`COPILOT_FIX` because nothing is unresolved.

## Acceptance criteria

- [ ] `resolveReviewThread` closes a thread by its id in one call
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [ ] `unresolveReviewThread` puts back what a reverted fix had closed
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [ ] The core dispatches `resolve-review-thread` to the code-host port
      (proof: test:packages/workflow-ticket-to-qa/tests/plugin.test.ts)
- [ ] A thread the agent answered is closed by the machine, and the next
      look sees it closed
      (proof: test:packages/workflow-ticket-to-qa/tests/machine.test.ts)
- [ ] A colleague's thread is never closed by the machine, however it was
      judged (proof: test:packages/workflow-ticket-to-qa/tests/machine.test.ts)
- [ ] `COPILOT_FIX` leaves because no automated thread is unresolved, not
      because the attempts ran out
      (proof: test:packages/workflow-ticket-to-qa/tests/walkthrough.test.ts)

**Exit condition:** a state whose exit is "no automated thread unresolved"
reaches that exit — the threads it answered are closed, and the ceiling is
for work that is genuinely stuck.
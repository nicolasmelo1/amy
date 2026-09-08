# An answer reaches the agent

`CLARIFYING` exists so that a ticket which does not say enough can be asked
about. It asks, it waits, and when somebody answers it looks again — with
exactly the information it had before.

`hasReplyAfter` returns a `boolean` (`plugins/linear/src/LinearTracker.ts:87`).
Its query already walks the conversation:

```graphql
comments(first: 100) { nodes { createdAt user { id } } }
```

and asks for the timestamp and the author id and not the text. No other method
on the tracker port returns a comment either — the surface is `inProgress`,
`get`, `comment`, `hasReplyAfter`, `setStatus`, `assign`, `createFollowUp`. So
amy can know *that* it was answered and never what was said.

The state then re-runs `triage` on an unchanged ticket, gets the same
questions back, asks them again, and does that until `maxClarifyAttempts` and
escalates. **`CLARIFYING` cannot clear because it was answered. It can only
time out.** The one path built for "a human knows something the ticket does
not" throws that knowledge away on arrival.

This is the sibling of [the ticket body](the-ticket-body-reaches-the-agent.md)
and worse in one way: that one produced wrong work from a thin input, and this
one guarantees that asking never fixes anything.

## The conversation is also polluted

`trackerChannel` posts announcement text straight onto the ticket
(`plugins/linear/src/plugin.ts:33`), and the fan-out reaches every mounted
channel with no way to choose one per announcement. Two of these were found on
a real ticket on a real board:

> TBO-1239 is failing in DISCOVERED and I am retrying: catalogue is not defined

> TBO-1239 is moving again in DISCOVERED after 1 failed attempt(s)

Nothing marks them as machine-written, so the moment comments *are* readable
they arrive looking like a person answering. An operator's only lever is
`notify.tracker: false`, which also silences the question amy actually wanted
to ask. Whatever reads comments has to be able to tell its own writing from
somebody else's, or reading them is worse than not.

## What changes

`Comment` is `{ author, body, at, fromAmy }`, and the port gains one method:

```ts
comments(ticketId: string, since?: string): Promise<Comment[]>
```

`hasReplyAfter` stays — a waiting state wants a cheap boolean and should not
pay for text on every poll — and is expressed in terms of the new method for a
tracker that would rather implement one.

`fromAmy` is the tracker's answer, not a guess by whatever reads it. The
Linear adapter already resolves `viewer()` for `hasReplyAfter`, so it knows
which comments are its own account's; a marker in the body is the fallback for
an adapter that cannot.

The `triage` prompt carries the conversation, split by who wrote it, and says
that an answer to an earlier question is part of the ticket. Anything amy
wrote is labelled as a question it already asked, so it does not read its own
words as new information and ask them twice.

And `trackerChannel` stops posting progress. A tracker comment is for a
question that needs a person; `failing`, `recovered` and `gave-up` are for the
operator and belong on the operator's channels. That removes the pollution
rather than teaching every reader to filter it.

## The gate

`ticket-to-qa`, extended. It owns `CLARIFYING`, and this is the only state
whose whole purpose is a round trip through a human:

- `clarifying.clears_when_the_question_is_answered`
- `clarifying.does_not_ask_the_same_question_twice`
- `clarifying.ignores_its_own_comments`

`plugin-agent-relay` for the prompt half, beside the assertions the ticket-body
plan adds there:

- `prompt.carries_the_answers_to_its_own_questions`

## Acceptance criteria

- [ ] `comments` returns author, text and time for a ticket
      (proof: test:plugins/linear/tests/LinearTracker.test.ts)
- [ ] A comment amy wrote comes back marked as its own
      (proof: test:plugins/linear/tests/LinearTracker.test.ts)
- [ ] An answered question moves the work on rather than being re-asked
      (proof: assertion:clarifying.clears_when_the_question_is_answered)
- [ ] A second look does not repeat a question already answered
      (proof: assertion:clarifying.does_not_ask_the_same_question_twice)
- [ ] amy's own comments are not read as answers
      (proof: assertion:clarifying.ignores_its_own_comments)
- [ ] The prompt contains the answers, attributed
      (proof: assertion:prompt.carries_the_answers_to_its_own_questions)
- [ ] No progress announcement reaches a tracker comment
      (proof: test:plugins/linear/tests/ticketChannel.test.ts)
- [ ] `hasReplyAfter` still answers without fetching text
      (proof: test:plugins/linear/tests/LinearTracker.test.ts)

**Exit condition:** a ticket that did not say enough is answered by a person
in a comment, and the work proceeds on that answer — `CLARIFYING` clears
because it was answered rather than because it ran out of attempts.

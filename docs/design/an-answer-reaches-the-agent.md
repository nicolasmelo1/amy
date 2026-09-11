# An answer reaches the agent

Delivered. The record of this decision is this document; what proves it is the
`ticket-to-qa` gate for the round trip through a person, the `plugin-agent-relay`
gate for the prompt half, and the unit suite for the tracker surface. The plan
that came before kept the argument; what it promised is the acceptance criteria
at the end.

## What was wrong

`CLARIFYING` exists so that a ticket which does not say enough can be asked
about. It asks, it waits, and when somebody answers it looks again — with
exactly the information it had before.

`hasReplyAfter` returns a `boolean` (`plugins/linear/src/LinearTracker.ts:87`).
Its query already walked the conversation and asked for the timestamp and the
author id, not the text, and no other method on the tracker port returned a
comment either. So amy could know *that* it was answered and never *what* was
said. The state then re-ran `triage` on an unchanged ticket, got the same
questions back, asked them again, and did that until `maxClarifyAttempts` and
escalated. **`CLARIFYING` could not clear because it was answered. It could
only time out.** The one path built for "a human knows something the ticket
does not" threw that knowledge away on arrival.

The conversation on the ticket was also polluted: `trackerChannel` posted
progress announcements straight onto the ticket under the operator's own name,
so the moment comments became readable they would arrive looking like a person
answering — the machine's own words as somebody else's answer. An operator's
only lever was `notify.tracker: false`, which also silenced the question amy
actually wanted to ask.

This is the sibling of [the ticket body](the-ticket-body-reaches-the-agent.md):
that one produced wrong work from a thin input, and this one guaranteed that
asking never fixes anything.

## What changed

`Comment` is `{ author, body, at, fromAmy }`, and the tracker port gains one
method:

```ts
comments(ticketId: string, since?: string): Promise<Comment[]>
```

`hasReplyAfter` stays — a waiting state wants a cheap boolean and should not
pay for text on every poll. `fromAmy` is the tracker's answer, not a guess by
whatever reads it: the Linear adapter resolves `viewer()` and marks the
comments its own account wrote, and a comment whose author it cannot resolve
arrives attributed to nobody rather than guessed.

The state re-reads the ticket with the conversation attached. `planClarifying`
builds the same ticket prose as before with the conversation appended, amy's
own comments labelled as questions it already asked and anybody else's as the
answers on the ticket — lines like `You asked: …` / `<name> answered: …` — so
the second look works from what changed, not from the ticket it already judged
insufficient. The runtime fetches `comments(since triage.at)` only in
`CLARIFYING`; a waiting state polls `hasReplyAfter` and pays for text only when
the answer has actually arrived.

The `triage` and `implement` prompts carry that conversation, attributed
("The conversation on the ticket, so far:"), and the outcome records
`askedQuestions` — the second look does not repeat a question the answer
closed, and a question is never read as its own answer. `Observation`
replaced `questionAnswered` with `conversation`, because the answer's text is
what the next decision is made from.

And `trackerChannel` stopped posting progress. A tracker comment is for a
question that needs a person; `failing`, `recovered` and `gave-up` are for the
operator and belong on the operator's channels. `notify.tracker` is gone with
it — config field, template prose, derived slices, doctor checks, tests. That
removes the pollution at the root rather than teaching every reader to filter
it.

## The gate

`ticket-to-qa`, extended. It owns `CLARIFYING`, and this is the only state
whose whole purpose is a round trip through a human:

- `clarifying.clears_when_the_question_is_answered`
- `clarifying.does_not_ask_the_same_question_twice`
- `clarifying.ignores_its_own_comments`

`plugin-agent-relay` for the prompt half, beside the ticket-body assertions:

- `prompt.carries_the_answers_to_its_own_questions`

## Acceptance criteria

- [x] `comments` returns author, text and time for a ticket
      (proof: test:plugins/linear/tests/LinearTracker.test.ts)
- [x] A comment amy wrote comes back marked as its own
      (proof: test:plugins/linear/tests/LinearTracker.test.ts)
- [x] An answered question moves the work on rather than being re-asked
      (proof: assertion:clarifying.clears_when_the_question_is_answered)
- [x] A second look does not repeat a question already answered
      (proof: assertion:clarifying.does_not_ask_the_same_question_twice)
- [x] amy's own comments are not read as answers
      (proof: assertion:clarifying.ignores_its_own_comments)
- [x] The prompt contains the answers, attributed
      (proof: assertion:prompt.carries_the_answers_to_its_own_questions)
- [x] No progress announcement reaches a tracker comment — the channel that
      carried them is deleted rather than silenced
      (proof: test:packages/cli/tests/slices.test.ts)
- [x] `hasReplyAfter` still answers without fetching text
      (proof: test:plugins/linear/tests/LinearTracker.test.ts)

**Exit condition:** a ticket that did not say enough is answered by a person
in a comment, and the work proceeds on that answer — `CLARIFYING` clears
because it was answered rather than because it ran out of attempts. Sealed in
the `ticket-to-qa` gate, where the world answers amy's question in a comment
after a look that made no move, the second look does not repeat the question,
and the machine's own comments are never read as answers.
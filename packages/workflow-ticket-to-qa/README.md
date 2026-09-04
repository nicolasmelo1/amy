# @amy/workflow-ticket-to-qa

The order in which actions happen, for one workflow: a ticket in the tracker's
working status, driven to a QA handoff.

It does not define actions. It composes the ones `@amy/core` ships, and it
owns the domain the adapters are typed against: `Ticket`, `PullRequestView`,
`Roster`, its own record, and its sixteen states.

## `plan()` is pure, and must stay pure

It reads a record and an observation and returns a plan. No I/O, ever. That is
why `tests/walkthrough.test.ts` drives the whole lifecycle with no network, no
tracker and no agent, and throws if the machine never settles, which is what
stops a new state becoming a dead end.

If a decision seems to need I/O, the I/O belongs in an action whose outcome is
recorded, and the next look reads the record.

## The reach is data, the logic is code

`usesActions` and `usesObservers` are declared as data, so the host can refuse
a mount where an action has no port behind it, and so the capability surface
can be measured without anybody reading the logic.

## Facts that look obvious and are wrong

Each is enforced by a test. Do not simplify one away.

- The working status is matched by **name**, never by category. The tracker
  files In Review, In QA, Ready To Release and Triage Review under the same
  `started` category as In Progress.
- Ask whether a reviewer has reviewed **the current head**, not whether they
  have reviewed. The bot posts a review even when it found nothing, and a
  human's requested-changes can sit on a commit from three pushes ago.
- The bot answers to three logins depending on which API you ask. `review.ts`
  is the only place that decides what counts.
- An implementation is dated against the gate. Without that, a red gate
  bounces to the agent, finds the previous successful attempt still recorded,
  and returns to the gate forever.

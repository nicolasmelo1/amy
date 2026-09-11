# The ticket body reaches the agent

Delivered. The record of this decision is this document; what proves it is the
`plugin-agent-relay` gate, for the prompt itself, and the `ticket-to-qa` gate,
for the trip from the tracker to the step that drives work. The plan that came
before kept the argument below; what it promised is the acceptance criteria
at the end.

## What was wrong

`ISSUE_FIELDS` asked Linear for `id`, `identifier`, `title`, `url`,
`branchName`, `state` and `team` (`plugins/linear/src/LinearTracker.ts:16`).
Not `description`. `toTicket` cannot carry what was never fetched, so
`Ticket` had no body and never could have one.

`HarnessAgent.triage` then built its prompt from three of those fields and
told the agent to go and get the rest:

```
Ticket ${ticket.id}: ${ticket.title}
Tracker: ${ticket.url}

Read the ticket and enough of this repository to judge it.
```

An agent under `claude -p` has no Linear credential and no browser. It is
being asked to read a page it cannot open, and the instruction reads as though
the body were available. `implement` is built the same way.

## Why this is worse than a missing field

It fails in two directions and only one of them is visible.

A ticket whose title does not carry the work produces an honest refusal. One
install said:

> I'm unable to access the Linear ticket in this non-interactive session — both
> the Linear MCP and WebFetch require authentication that can't be set up
> automatically.

That is the good case. It surfaces as `action.failed`, the ceiling catches it,
and somebody is told.

A ticket whose title *sounds* sufficient produces work instead. On the install
where this was found, a 2-point ticket became 8 files and +615 lines. Its
description said, in bold, *"Consume the DB-layer aggregate from TBO-1236 — do
not rebuild the SUM here"*, and named the file that other ticket owns. The
agent added 75 lines to exactly that file, including the aggregate, duplicating
an open pull request. It also had four acceptance criteria and a warning about
an enum that would fail in SQL; the agent got none of them, guessed the enum
right, and was never going to guess the ownership boundary.

Nothing about that run looked wrong. The gate was green, every source file had
a test beside it, the reviewer was assigned. The whole pipeline behaved, on an
input that was one line long.

The workaround, on that install, was a private workflow package reading the
Linear API itself with the key from `~/.amy/.env`, and replacing `triage` and
`implement` with `run-errand` so it could write its own prompt. A workflow
reimplementing the tracker because the tracker would not carry a body, and
stepping off two of the core's actions to do it.

## What changed

`Ticket` gains `body`, and the fetch asks for it:

```ts
const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  url
  branchName
  state { name }
  team { id key name }
`;
```

`toTicket` maps `description` to `body`. Absent stays absent — a ticket with
an empty description is a real state and is not an error.

The three prompts in `agent-kit` include it, and stop instructing a fetch
nobody can perform:

```
Ticket ${ticket.id}: ${ticket.title}
Tracker: ${ticket.url}

${ticket.body ?? "(this ticket has no description)"}
```

`Read the ticket` becomes `Read enough of this repository to judge it`. The
tracker is the thing that reads a tracker; the agent reads a repository. When
a ticket genuinely has no body, saying so is what lets an agent ask for one
through `CLARIFYING` rather than invent one.

A tracker that cannot supply a body is unaffected: `body` is optional, and the
prompt says which case it is in.

## The gate

`plugin-agent-relay`, extended. It already drives the agent side against fake
CLIs with no credential, which is exactly what proving a prompt needs — the
fake records what it was asked. Added:

- `prompt.carries_the_ticket_body`
- `prompt.says_so_when_a_ticket_has_none`
- `prompt.sends_the_agent_to_the_repository_not_the_tracker`

`ticket-to-qa` covers the other half, that a body fetched from the tracker
survives the trip to the action:

- `lifecycle.triage.reads_a_body_the_tracker_supplied`

## Acceptance criteria

- [x] The prompt an agent receives contains the ticket's description
      (proof: assertion:prompt.carries_the_ticket_body)
- [x] A ticket with no description produces a prompt that says so, rather than
      one that looks truncated
      (proof: assertion:prompt.says_so_when_a_ticket_has_none)
- [x] No prompt tells an agent to read a tracker page
      (proof: assertion:prompt.sends_the_agent_to_the_repository_not_the_tracker)
- [x] `inProgress` and `get` both return the body
      (proof: test:plugins/linear/tests/LinearTracker.test.ts)
- [x] A body reaches `triage` and `implement` through the runtime unchanged
      (proof: assertion:lifecycle.triage.reads_a_body_the_tracker_supplied)
- [x] A tracker that supplies no body still mounts and still drives work
      (proof: test:packages/workflow-ticket-to-qa/tests/runtime.test.ts)

**Exit condition:** a ticket whose description contains an instruction the
title does not — an ownership boundary, an acceptance criterion, a named
file — is implemented in accordance with it, and a ticket with no description
is asked about rather than guessed at. The first half is sealed in the
`ticket-to-qa` gate (the stand-in ticket's description carries an instruction
its title does not, and the triage prompt carries it); the second holds on the
same run's question-and-answer path, where a body that leaves a question
hanging is asked about on the ticket rather than guessed at, and in the
`plugin-agent-relay` gate's say-so assertion, where an absent body is named
rather than truncated.
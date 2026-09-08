# The ticket body reaches the agent

`ISSUE_FIELDS` asks Linear for `id`, `identifier`, `title`, `url`,
`branchName`, `state` and `team` (`plugins/linear/src/LinearTracker.ts:16`).
Not `description`. `toTicket` cannot carry what was never fetched (`:211`), so
`Ticket` has no body and never has.

`HarnessAgent.triage` then builds its prompt from three of those fields and
tells the agent to go and get the rest:

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

A ticket whose title does not carry the work produces an honest refusal. Ours
said:

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

## What changes

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

The two prompts in `agent-kit` include it, and stop instructing a fetch nobody
can perform:

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
fake records what it was asked. Add:

- `prompt.carries_the_ticket_body`
- `prompt.says_so_when_a_ticket_has_none`

`ticket-to-qa` covers the other half, that a body fetched from the tracker
survives the trip to the action:

- `triage.reads_a_body_the_tracker_supplied`

## Acceptance criteria

- [ ] The prompt an agent receives contains the ticket's description
      (proof: assertion:prompt.carries_the_ticket_body)
- [ ] A ticket with no description produces a prompt that says so, rather than
      one that looks truncated
      (proof: assertion:prompt.says_so_when_a_ticket_has_none)
- [ ] No prompt tells an agent to read a tracker page
      (proof: test:packages/agent-kit/tests/HarnessAgent.test.ts)
- [ ] `inProgress` and `get` both return the body
      (proof: test:plugins/linear/tests/LinearTracker.test.ts)
- [ ] A body reaches `triage` and `implement` through the runtime unchanged
      (proof: assertion:triage.reads_a_body_the_tracker_supplied)
- [ ] A tracker that supplies no body still mounts and still drives work
      (proof: test:packages/workflow-ticket-to-qa/tests/runtime.test.ts)

**Exit condition:** a ticket whose description contains an instruction the
title does not — an ownership boundary, an acceptance criterion, a named
file — is implemented in accordance with it, and a ticket with no description
is asked about rather than guessed at.

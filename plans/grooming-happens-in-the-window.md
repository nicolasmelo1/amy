# Grooming happens in the window

Tickets reach amy without anybody asking: the tracker returns them when a
person moves them into the working status, and discovery puts them on the
queue. A ticket worth a brief gets one by somebody running the `amy-groom`
skill in an agent, beside amy rather than inside it
(*grooming reads the sections its workflow declares*).

Grooming is the conversation *a conversation before the work* gives the
window, with a shape: the workflow's sections, one question at a time, and
`amy brief check` after each. It should start where the work is listed.

## What changes

**`+ groom` in nav 2 starts from a ticket that exists.** It searches the
tracker, read-only, and opens a grooming conversation about the one picked.
amy never creates a ticket: the tracker is where a person writes, and the
conversation helps them write it — a draft of the ticket text is something to
copy, not something sent.

**The conversation is the skill, inside the window.** The prompt is the one
`amy-groom` ships — read the sections the workflow declares and the code at the
base branch first, ask one question at a time, in section order — so the skill
and the window cannot groom differently. Each answer is written through the
`brief` port, and the canvas shows the brief beside the conversation, with
each section's `brief check` refusals next to it.

**A brief that is not green holds its ticket.** That is the workflow's
decision and stays one: a workflow with a grooming state already refuses to
build an ungroomed ticket. The window shows the hold, and why, on the ticket's
row.

## The gates

`ui-window` gains grooming. The conformance world's tracker is the fake one
`ticket-to-qa`'s gate already uses, so "writes nothing to the tracker" is its
call log being empty of mutations, not a promise.

## What it delivers

The `grooming` domain — `searchTickets`, `startGrooming`, `getGrooming` and `addGroomingTurn` — and the view `grooming.detail`, from *every endpoint is named before it is built*, flipped to
`delivered` in `surface.yaml` in the same pull request.

## Acceptance criteria

- [ ] What this row delivers is `delivered` in `surface.yaml`, and the surface
      gate is green (proof: deferred:test:packages/server/tests/surface.test.ts)

- [ ] `+ groom` sits in nav 2 in every renderer
      (proof: deferred:assertion:frame.every_region_sits_where_declared)
- [ ] Picking a ticket reads the tracker and its call log holds no mutation
      (proof: deferred:assertion:window.grooming_writes_nothing_to_the_tracker)
- [ ] The window's grooming prompt is byte-identical to the shipped skill's
      (proof: deferred:test:packages/cli/tests/ui-groom.test.ts)
- [ ] An answer lands in the brief through the port, and that section's check
      reruns (proof: deferred:assertion:window.an_answer_reaches_the_brief)
- [ ] A ticket whose brief is refused carries the refusal on its row
      (proof: deferred:assertion:window.a_refused_brief_holds_its_row)

**Exit condition:** a person picks an existing ticket in the window, is asked
about each declared section until `amy brief check` is green, moves the ticket
to the working status in the tracker by hand, and amy builds it with that
brief — no tracker write made by amy anywhere in the call log.

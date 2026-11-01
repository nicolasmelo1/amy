---
sources:
  - { id: S1, kind: reference, ref: "plans/grooming-reads-the-sections-its-workflow-declares.md", said: "tickets reach amy when a person moves them into the working status; a brief comes from somebody running the amy-groom skill in an agent, beside amy rather than inside it" }
  - { id: S2, kind: reference, ref: "plans/a-conversation-before-the-work.md", said: "grooming is that plan's window conversation with a shape: the workflow's sections, one question at a time, amy brief check after each; it should start where the work is listed" }
  - { id: S3, kind: decision, said: "+ groom in nav 2 searches the tracker read-only and opens a grooming conversation about the picked existing ticket" }
  - { id: S4, kind: decision, said: "amy never creates a ticket: the tracker is where a person writes; a draft of ticket text is something to copy, not something sent" }
  - { id: S5, kind: decision, said: "the prompt is the one amy-groom ships (read declared sections and the code at the base branch first, one question at a time, in section order), so skill and window cannot groom differently" }
  - { id: S6, kind: decision, said: "each answer is written through the brief port; the canvas shows the brief beside the conversation with each section's brief check refusals next to it" }
  - { id: S7, kind: decision, said: "a brief that is not green holds its ticket: the workflow's decision, already made by a grooming state refusing an ungroomed ticket; the window shows the hold and why on the ticket's row" }
  - { id: S8, kind: decision, ref: ".software-factory/policy.yaml", said: "ui-window gains grooming; the conformance world's tracker is ticket-to-qa's fake, so writes-nothing is its call log empty of mutations, not a promise" }
  - { id: S9, kind: reference, ref: "plans/every-endpoint-is-named-before-it-is-built.md", said: "delivers the grooming domain (searchTickets, startGrooming, getGrooming, addGroomingTurn) and view grooming.detail, flipped to delivered in surface.yaml in the same pull request" }
touches:
  - packages/server/surface.yaml
  - packages/server/src/**
  - packages/server/tests/surface.test.ts
  - packages/ui/**
  - packages/ui-conformance/**
  - packages/cli/src/ui/**
  - packages/cli/tests/ui-groom.test.ts
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "what this row delivers is delivered in surface.yaml, and the surface gate is green", proof: "deferred:test:packages/server/tests/surface.test.ts", sources: [S9] }
  - { id: A2, statement: "+ groom sits in nav 2 in every renderer", proof: "deferred:assertion:frame.every_region_sits_where_declared", sources: [S2, S3] }
  - { id: A3, statement: "picking a ticket reads the tracker and its call log holds no mutation", proof: "deferred:assertion:window.grooming_writes_nothing_to_the_tracker", sources: [S3, S4, S8] }
  - { id: A4, statement: "the window's grooming prompt is byte-identical to the shipped skill's", proof: "deferred:test:packages/cli/tests/ui-groom.test.ts", sources: [S1, S5] }
  - { id: A5, statement: "an answer lands in the brief through the port, and that section's check reruns", proof: "deferred:assertion:window.an_answer_reaches_the_brief", sources: [S6] }
  - { id: A6, statement: "a ticket whose brief is refused carries the refusal on its row", proof: "deferred:assertion:window.a_refused_brief_holds_its_row", sources: [S7] }
crosses:
  - { mechanism: rendering, answer: works, proof: "deferred:assertion:frame.every_region_sits_where_declared" }
guarantee:
  - { holds: "amy makes no tracker write while grooming", not_against: "a person moving the ticket to the working status by hand" }
cut:
  - "amy creating or sending a ticket: refused; a draft is something to copy (S4)"
  - "moving the hold decision into the window: refused; holding an ungroomed ticket stays the workflow's decision (S7)"
exit: "a person picks an existing ticket in the window, is asked each declared section until amy brief check is green, moves it to working status by hand; amy builds it with that brief, its call log holding no tracker write"
---
# Grooming happens in the window

A brief is written today by running the `amy-groom` skill in a separate agent, beside amy. Grooming is a conversation with a shape, and it should start where the work is listed.

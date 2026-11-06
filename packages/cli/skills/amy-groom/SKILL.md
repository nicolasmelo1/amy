---
name: amy-groom
description: >-
  Groom a feature into the brief a workflow reads before it builds — by
  reading the ticket and the code at its base, then interrogating one question
  at a time until every requirement names its source. Use when somebody says
  "groom PROJ-123", "write the brief for…", "/amy-groom <id>", or wants a
  ticket held until its brief says what was asked for. Learns the brief's
  format and check from the workflow that judges it; writes a local file and
  nothing to the tracker, the code host or chat.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [amy, brief, grooming, declaration]
    related_skills: [amy, amy-workflow, amy-status]
---

# Grooming a brief

A brief is what a workflow reads to know what a ticket was asked to do, and
grooming has one rule: **a requirement names its source, or it is cut.** Not
flagged, not recorded as an assumption — cut, with the reason, where the next
round and the reviewer can see it was considered.

This skill is the method, not the format. The format belongs to the workflow
that judges the brief, so it comes from that workflow's parser, never from
memory.

## Find the workflow that owns the brief

1. Read `~/.amy/config.yaml`. The workflows are under `workflows:`; the one
   that judges briefs is usually its own phase beside the one that builds
   (`amy workflow list` names them). Its plugin slice says where a
   declaration is read from — a local directory, or a block on the feature
   issue — and the brief is filed under the ticket's tracker parent, its
   `briefId`, or the ticket itself when it has none.
2. Open that workflow's package and read its brief reference and its parser
   before the first question: what keys a declaration has, what it refuses
   and by which code, and the command that checks a file. If the reference and
   the parser disagree, the parser wins — say so.
3. If no mounted workflow judges a brief, there is nothing for a declaration
   to be read by. Say that, and stop: a file nobody reads holds no ticket.

## What this never does

- **Write where the team reads.** No tracker comment or description edit, no
  pull request, no chat message. Reading the ticket is the only tracker call.
  If the brief belongs on the issue, the person pastes it.
- **Invent a source.** No design frame nobody opened, no decision nobody said.
  A requirement with no source goes to `cut` with its reason.
- **Move a checkout.** The code is read at a commit (`git grep <rev>`,
  `git show <rev>:<path>`, `git cat-file -e <rev>:<path>`), never by switching
  a branch somebody is working on.
- **Edit a brief a workflow has started on** without saying that it resets
  what was judged against it.

## Before the first question

1. **The ticket.** Read it, its parent and its comments, read-only. The
   product ticket is the first source.
2. **The base.** The branch the work will start from — a stacked ticket's is
   its parent ticket's branch, as the workflow's config says. Fetch in the
   standing checkout and pin one commit: `git rev-parse origin/<base>`. Every
   fact about the code in this brief is read at that commit.
3. **The code at that commit.** Find what the feature would touch and what
   already does part of it. A requirement the base already meets is a cut,
   not a requirement.

Show back what you read in a few lines — the ask, the base and its commit,
what already exists, where the sources disagree — before asking anything.

## How it runs

**One question at a time**, each carrying the answer you would give and why,
so agreeing is cheap and disagreeing is deliberate. **After each answer, show
the declaration as it now stands, as a diff** against the round before. Write
no file until the person says go; then write it and run the check.

Ask in this order — each is only checkable once the one before is settled:

1. **Sources.** What may ask for anything: the product ticket, a design frame
   actually opened, an integration's documented data model, and a decision —
   who, when, what was said. The person in this conversation counts, named.
   An image of a design pasted into a ticket is that ticket, not the design.
2. **Requirements.** One behaviour each, a concrete example, the sources that
   ask for it, and whether a person sees it. Anything no source asks for is
   proposed as a cut, never as a requirement.
3. **Open questions.** What cannot be answered now, and which requirements
   each one stops. A question that stops nothing is a note. One that stops a
   requirement a ticket covers keeps that ticket waiting — that is the point:
   an answer becomes a decision source.
4. **The split.** Which ticket covers which requirements, in which
   repository, the files it touches, what is out of its scope, and the files a
   reviewer might expect in the diff and will not find.
5. **Whatever else the workflow's format asks** — a module's imports, a new
   mechanism against what exists at the base, an order of slices. Run every
   search it names at the pinned commit yourself; a hit is a cut.

Stop when nothing is left assumed, not after N questions. Questions about
naming, formats and empty values are the ones a reviewer raises first: ask
them here, where the answer can be written down as a source.

## The check

Run the workflow's own check on the file after every write and fix until it
is green. A check run outside the workflow usually cannot see the base branch
or the tracker, so close that gap by hand before calling it done:

- every path the split touches exists at the pinned commit, or is meant to be
  new;
- every search the format names finds nothing at that commit;
- every ticket the split names is filed under the feature in the tracker —
  its parent is the feature, or the brief is named after the ticket itself.
  A brief the tracker files a ticket away from is a brief that ticket never
  reads.

## Done

Say, in this order: the file path, the check output, the base commit it was
read at, the cuts, and the open questions with what each blocks. Then what the
person does next — usually a tick of the phase that judges briefs, a tick of
the workflow that reads the verdict, and `amy brief <FEATURE>` for what was
published.

---
name: amy-groom
description: >-
  Groom a feature into the brief a workflow reads before it builds — by
  reading the ticket and the code at its base, then asking one question at a
  time, section by section in the order the workflow declares them, until
  `amy brief check` is green. Use when somebody says "groom PROJ-123", "write
  the brief for…", "/amy-groom <id>", or wants a ticket held until its brief
  says what was asked for. The sections and the check come from the workflow;
  every answer is written through `amy brief write`, and nothing goes to the
  tracker, the code host or chat.
version: 2.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [amy, brief, grooming, declaration]
    related_skills: [amy, amy-workflow, amy-status]
---

# Grooming a brief

A brief is what a workflow reads to know what a piece of work was asked to
do, and grooming has one rule:
**a requirement names its source, or it is cut.** Not flagged, not recorded
as an assumption — cut, with the reason, where the next round and the
reviewer can see it was considered.

This skill is the method, never the format. Which sections a brief has, in
which order, and what makes one ready belong to the workflow that judges it:
amy reads them off that workflow's declaration and runs its check. Nothing
below names a section; ask what `amy brief sections` names.

Everything here is a shell command, so it runs from any agent that reads
skills — one beside the machine running amy, or one the operator talks to
from a phone.

## What the workflow asks for

```sh
amy brief sections --json
```

On a machine with more than one workflow, put `--workflow <name>` on this and
**every** `amy brief` command after it: each command picks the default
workflow on its own, and a write without it lands in that workflow's store.

answers the sections in the order grooming asks them: in a project, the
brief's own sections first, then each later phase's in walk order — a
`prove/` phase asks for its scenario there. `phases[].check` says whether each
phase exports a check.

- If the command says the workflow declares no brief, there is nothing for a
  brief to be read by. Say that and stop: a brief nobody reads holds no work.
- If the brief phase has no check, `amy brief check` will refuse every brief
  and `amy doctor` says so. Tell the person; do not groom against a check that
  does not exist.
- When a workflow's prose and its check disagree about a section, the check is
  what amy runs: the parser wins — say so.

## What this never does

- **Write where the team reads.** No tracker comment or description edit, no
  pull request, no chat message. Reading the ticket is the only tracker call.
  Every answer goes through `amy brief write`, which writes through the brief
  port the workflow reads; never edit the files behind it.
- **Invent a source.** No design frame nobody opened, no decision nobody said.
  A requirement with no source goes to the cuts with its reason.
- **Move a checkout.** The code is read at a commit, never by switching a
  branch somebody is working on.
- **Rewrite a brief a workflow has started on** without saying that it resets
  what was judged against it.

## Before the first question

1. **The ticket.** Read it, its parent and its comments, read-only. The
   product ticket is the first source.
2. **The base.** The branch the work will start from, as the workflow's config
   says. Read it the way amy's base source does: fetch it to a named
   destination, `git fetch --no-tags origin +refs/heads/<base>:refs/remotes/origin/<base>`,
   pin one commit with `git rev-parse origin/<base>`, and read every fact about
   the code at that commit — `git show <rev>:<path>`, `git grep <text> <rev>`,
   `git cat-file -e <rev>:<path>`. No checkout, no switch.
3. **The code at that commit.** Find what the feature would touch and what
   already does part of it. A requirement the base already meets is a cut,
   not a requirement.
4. **The brief as it stands.** `amy brief check <id> --json`. A brief not
   stored yet refuses every section; one already groomed shows what is left.

Show back what you read in a few lines — the ask, the base and its commit,
what already exists, where the sources disagree, the sections the workflow
asks for — before asking anything.

## How it runs

Ask about the section `amy brief check <id> --json` names as `next`, **one
question at a time**, each carrying the answer you would give and why, so
agreeing is cheap and disagreeing is deliberate. Show the section as it would
be written before writing it.

Write the section once the person agrees, piping the answer so a line
starting with `-` is never read as a flag:

```sh
amy brief write <id> "<section>" --explains <work ids> <<'EOF'
…the answer…
EOF
amy brief check <id> --json
```

`--explains` is needed only on the first write; later ones keep it. Then read
the check:

- **`next` names a section already answered** — the check refused what was
  written. Ask about it again, carrying the rule it broke. Do not move on.
- **`next` names a section not answered yet** — every refusal left is about a
  section still to ask, so move on to it, even when it belongs to a later
  phase.
- **`ok` is true** — stop. The brief is groomed.

A refusal with no `section` is about the declaration, not the brief — a
missing check, a check that threw. It is the workflow's to fix: say it and
stop.

Stop when the check is green, not after N questions. Questions about naming,
formats and empty values are the ones a reviewer raises first: ask them here,
where the answer can be written down as a source.

## The check cannot see everything

`amy brief check` runs every phase's check against the stored brief and the
operations the mounted plugins offer. What it cannot see, close by hand
before calling it done:

- every path the brief names exists at the pinned commit, or is meant to be
  new;
- every search the brief claims finds nothing does find nothing at that
  commit;
- the work ids the brief explains are the ones the tracker files under the
  feature — a brief explaining a ticket the tracker files elsewhere is one
  that ticket never reads.

## Done

Say, in this order: the brief id and the green `amy brief check` output, the
base commit it was read at, the cuts, and the open questions with what each
blocks. Then what the person does next — usually a tick of the workflow that
reads the brief, and `amy brief <id>` for what it now says.

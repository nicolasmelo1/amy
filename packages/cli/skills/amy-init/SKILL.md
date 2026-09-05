---
name: amy-init
description: >-
  Set amy up on this machine end to end — the state directory, the config, the
  roster, the plugins it needs installed, the credentials, the notification
  channel — by reading what is already here and asking only what the machine
  cannot answer. Use when installing amy for the first time, when `amy doctor`
  is red and it is not obvious why, when adding a second workflow to an
  install, or when moving amy to a new machine.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [amy, setup, configuration, install, doctor]
    related_skills: [amy, amy-workflow]
---

# Setting amy up

amy is one install per machine, not one per project. It keeps everything in
`~/.amy` and drives work in repositories all over the disk, so this is set up
once and then adjusted.

**Read before asking.** Most of this config is discoverable, and a question
whose answer is on disk is a question that wastes the one thing the person
came with. Ask in rounds, each question numbered, each with the answer you
recommend and why.

## What to find out before the first question

```sh
amy --version                 # installed at all, and which build
amy workflow list             # what it can drive, and what is missing
ls ~/.amy 2>/dev/null         # set up already, or first time
git config --get user.email   # who this is
gh auth status                # is the code host reachable
hermes send --list --json     # what notification targets exist
```

And in the workspace: `ls ~/workspaces` or wherever checkouts live, to see
which repositories are actually on this machine.

## The rounds

**Round 1 — what is this install for.** Which workflows they want. The two
shipped are `ticket-to-qa` (a tracker ticket to a QA handoff) and
`note-to-plan` (friction becomes a plan). A third is a package of their own —
hand that to `/amy-workflow` rather than inventing it here.

**Round 2 — the world.** Repositories, where the checkouts are, which team's
tickets land where, and the gate command per repository. Read `package.json`,
`Makefile` or CI config and *propose* the gate rather than asking blind:

> ➡️ I'd use `npm run lint && npm run typecheck` for `northwind-backend` —
> that is what `.github/workflows/ci.yml` runs on every PR. Not the test
> suite, because it needs a database this machine does not have.

**Round 3 — who.** The roster: reviewers, QA, and their logins on the tracker
and the code host. This is the one thing nothing can be inferred for, and it
is also the one that goes stale — explain that `amy roster confirm` is a daily
thing and that amy refuses to assign anybody while it is stale.

**Round 4 — money and models.** The agent ladder and the budget. Two ceilings,
per window, and the first to blow parks the work. Recommend a budget rather
than leaving it out: an install with no ceiling is one bad loop from a bill.

**Round 5 — how it reaches them.** At least one channel. `tracker` comments on
the ticket, `hermes` delivers to Slack or Telegram, `inbox` writes a file and
raises a desktop notification. Check the hermes target exists rather than
trusting the name.

**Round 6 — the loop.** Whether they want `amy start` running in the
background, and how often it should look. Say plainly that it keeps running
after the terminal closes and that `amy stop` ends it.

## Then apply, and read it back in numbers

```sh
amy init                      # writes ~/.amy/config.yaml and roster.yaml
# edit both with the answers
amy roster confirm
amy doctor
```

Read the result back as facts, not reassurance: how many repositories are
checked out, which plugins are installed against which are mounted, what the
budget allows per window, which channel is on, and every single thing `amy
doctor` still says is wrong.

**A red `doctor` is the deliverable if it is red.** Never report a setup as
done while it lists a problem; name each one and what fixes it.

## The failures that are worth knowing before you hit them

- **A plugin named and not installed is refused at boot**, with the list of
  what *is* installed. That is a typo, nearly always. `npm install -g <name>`
  fixes it; `amy plugin list` shows both sides.
- **`LINEAR_API_KEY` lives in `~/.amy/.env`**, not in the shell profile, so a
  loop started from a launchd agent has it too.
- **`amy doctor` refuses a plugin setting that is not one the plugin has.**
  The message names the plugin and the field. It is checking the schema the
  plugin itself declared, so it is never out of date.
- **State left in a working directory is reported, not adopted.** amy used to
  keep state in `./.amy`; if doctor mentions one, move it or delete it, but do
  not expect amy to read it.
- **Nothing here is installed with the command.** `@amykit/cli` carries the
  command and the host services; the plugins are separate, on purpose, so a
  machine with no `codex` carries no code for one. `amy init` prints the
  `npm install` line for whatever is missing.

## Adding a workflow to an install that exists

Do not re-run the interview. Ask the three questions that a second profile
actually needs — which package drives it, which plugins it mounts, whether
`amy note` should file friction onto it — and write just that block:

```yaml
workflows:
  oncall:
    workflow: "@acme/workflow-oncall"
```

Each profile keeps its records and queue under `~/.amy/<name>/`, so adding one
cannot disturb the other. Then `amy --workflow oncall doctor`.

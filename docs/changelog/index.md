---
title: News
description: What shipped, and what is about to.
group: News
order: 1
---

# News

Every release, and everything written down and not released yet.

The released half comes from the releases on GitHub, cached into this repository
so that building the documentation never needs a network. The unreleased half
comes from the changesets in the working tree, which is the only one of the two
that exists before a release does.

```sh
npm run docs:changelog     # refresh the cache from GitHub
```

## Coming next

<!-- amy:generated changelog-unreleased -->

### **A reply in a work's thread can be a question, not only an answer.**

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-claude`, `@amykit/plugin-codex`, `@amykit/plugin-hermes-agent`, `@amykit/plugin-slack`, `@amykit/workflow-ticket-to-qa`

When `ticket-to-qa` escalated, or asked a question before starting, the owner's
first message in the thread ended the wait and the work resumed on it. A person
who replied "why do you think that comment is wrong?" had not decided anything,
and watched their question turn into work.

- `Reply` gains an optional `kind`, `discussion` or `decision`, set only when
  the person marked the reply. The catalogue gains `discuss`, on the `agent`
  port, so it is charged to the budget like every other run.
- `policy.conversation` on `ticket-to-qa`: `answer`, the default, reads a reply
  nobody marked as the decision, exactly as before. `discuss` reads it as a turn
  in a discussion: answered in the thread, read-only, with no state change, no
  commit and no attempt counted, while the work waits for a reply marked as the
  decision. A marked reply reads as marked under either. An unknown value is
  refused at boot by name.
- `AskContext` gains `readOnly`, and a discussion is asked with it. The
  harness enforces it rather than the prompt: Claude runs with
  `--permission-mode plan`, Codex with `--sandbox read-only`, and Hermes, whose
  one-shot mode cannot keep its tools off the checkout, refuses the run so a
  relay hands it to a harness that can.
- On the decision, the step the work resumes is prompted with the whole
  discussion, attributed, with the decision last.
- The Slack plugin marks a reply by the operator's own reaction on it: ✅
  (`white_check_mark`) decides, 💬 (`speech_balloon`) discusses. Both names are
  settings, `decisionReaction` and `discussionReaction`. A reaction Slack lists
  only in part is read again in full with `reactions.get`, which needs the
  `reactions:read` scope; without it, that one read fails and says so.
- Without a conversation port, a comment on the ticket is still the decision,
  whatever the policy says.

<!-- amy:end changelog-unreleased -->

## Released

<!-- amy:generated changelog-releases -->

No release has been cut yet. The release workflow is deliberately dormant until
somebody arms it, so this is the truth rather than a fetch that failed —
see [the release path](../development/releasing.md).

<!-- amy:end changelog-releases -->

## Per-package changelogs

Each package carries its own `CHANGELOG.md`, written by `changeset version`. The
news above is the whole workspace; a package's own file is the one to read when
you depend on exactly that package.

## How a change gets here

Every change a user would notice needs a changeset:

```sh
npm run changeset
```

Written for somebody reading it six months from now: **what changed, and why it
was wrong before.** A changelog entry that says what the diff says is one nobody
gains anything from reading.

See [Releasing](../development/releasing.md).

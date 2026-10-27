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

### **A view is data.**

`minor` · `@amykit/cli`, `@amykit/ui`

amy is going to have a window — a terminal, a browser, eventually a phone —
with plugins changing what is in it. A plugin that exports React components
renders in one of those and none of the others, cannot reach a phone that
installs no npm packages, and brings a second copy of React into somebody's
window. So a plugin does not render: it describes, and the renderer draws.

- A new package, `@amykit/ui`, with no dependencies: a closed vocabulary of
  seventeen semantic primitives, checked so a name outside it — or any
  property value that is not JSON — is refused by name; a JSX runtime
  (`jsxImportSource: "@amykit/ui"`) that returns a tree of plain data with
  no React anywhere; `diff` and `patch` between two trees; `validate` for a
  tree that arrived as data; `catalogue()`, the vocabulary as JSON Schema
  components; and `renderText`, a deterministic text renderer.
- A button's `intent` is `{ action, args }`, never a closure, so it survives
  a socket.
- `amy status` is a view of the snapshot `amy status --json` prints, drawn by
  the text renderer. Its output is what it printed before, byte for byte.
- A new local rule, `L0.A_VIEW_DRAWS_NOTHING`: no package or plugin source
  imports React, Ink, Preact, Vue, Solid or Svelte, or compiles its JSX
  against one.

### **The event log can be watched, from any process.**

`minor` · `@amykit/core`, `@amykit/plugin-file-log`

Everything amy does is a line in the event log, and a reader in another
process — `amy status`, a dashboard, the window planned next — could only read
it again and guess how often. The log is the one place that knows something
changed, so it is now the place to ask.

- `EventLog` gains an optional `watch(since, onEvent)`: every event at or
  after `since`, oldest first, then every event any process appends, until the
  returned function is called. Optional because a log may be a sink nobody
  can watch.
- `watchEvents(log, since, onEvent, { everyMs, onPolling })` in the core
  watches any log: through its own `watch`, or by polling `read` when it has
  none, calling `onPolling` once so the caller can say so.
- `@amykit/plugin-file-log` implements `watch` by following each day file from
  a byte offset. A line is delivered only once its newline is on disk, so a
  line the daemon is halfway through writing is never read half, and a new
  day's file is followed without resubscribing.

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

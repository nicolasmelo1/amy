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

### **Claude says its limit while it runs.** The harness spotted a quota only from a 429 in the final envelope, and never knew when it reset. It now reads Claude Code's stream: a rejected `rate_limit_event` makes the run `rate-limited` with the reset it reported, so the workflow waits for that reset instead of charging an attempt.

`minor` · `@amykit/plugin-claude`



### The examples in the docs, the tests and the prove plugin's help name tickets `PROJ-`, the placeholder the rest of the suite already used. A private term can now be denied as a whole word, so a three-letter key is caught in `XYZ-12` without also firing on every identifier that contains those letters.

`patch` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-prove`



### **A skill reaches every harness.**

`minor` · `@amykit/agent-kit`, `@amykit/core`, `@amykit/plugin-agent-relay`, `@amykit/plugin-codex`, `@amykit/plugin-hermes-agent`

A step's skill was lent only to Claude; Codex received `/name` with nothing
behind it and Hermes refused the turn. Codex now runs under a fresh `HOME` that
holds only the lent skill, and names it explicitly on `turn/start`; Hermes
passes `-s <name>` with amy's skill root named in the profile's
`skills.external_dirs`, and both declare `lendsSkill`. The relay never sends a
skill's name to a rung it did not hand the skill to, a ladder that could reach
such a harness is refused at boot, and the conformance suite fails a harness
that answers a skill turn without declaring it. Codex and Hermes are held to
their pinned CLI contracts, vendored beside the doubles.

### **Claude's usage is read without its token.** The usage reader took Claude Code's OAuth token from the environment, `~/.claude/.credentials.json` or the macOS Keychain and called an undocumented endpoint. It now asks Claude Code itself for `get_usage` over a short-lived print-mode child: no model call, no credential of the operator's, and a runner without a managed spawn reads as unavailable.

`minor` · `@amykit/plugin-claude`

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

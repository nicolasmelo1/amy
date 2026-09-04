# @amy/plugin-github

GitHub as the code host, through the `gh` CLI.

Mounts the `code-host` port. It shells out to `gh` rather than holding a token
of its own, so it reuses a login the operator already has and there is one
fewer credential to leak.

## Why the commit sha is on every review

The mapping keeps the commit each review was submitted against, because
without it a stale review looks current. The real answer that motivated this,
from a real pull request: the bot had reviewed three different commits and the
human's requested-changes was sitting on the oldest one. Asking "has this been
reviewed" would have sent it to QA with nobody having read the final code.

## Other things worth knowing

- The bot posts a `COMMENTED` review **even when it found nothing**, so an
  empty review on the current head is the signal that it has finished, and
  "no threads" is not.
- Review load is counted across **every** repository given. Counting one
  sends every review to whoever happens to be quiet in that one.
- A pending review has no author and no commit, and is dropped rather than
  counted.

Its test fixture is shaped from a real API response, which is how the stale
review case above was caught.

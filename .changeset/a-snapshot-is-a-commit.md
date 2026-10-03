---
"@amykit/core": minor
---

A grooming snapshot is now a commit that can be searched. `GitBaseSource.snapshot` never fetched, so on a machine where nobody had started a ticket in a repository for two weeks it answered "this column does not exist" about a column that shipped twelve days ago; it read `origin/<base>` again on every call, so two reads in one run could come from two commits; and it returned no revision, so no claim made from it could be checked later. It now fetches `+refs/heads/<base>:refs/remotes/origin/<base>` first (naming the destination, so a checkout with a narrowed `remote.origin.fetch` still moves) and refuses the snapshot if that fails rather than serving the old ref, then pins the commit it resolved, and every answer is read at that commit.

This is breaking for anything that implements `BaseSourceSnapshot` itself: it must now provide `revision` (the full commit id), `committedAt` (ISO 8601), `search(text, { paths, regex, limit })`, which returns `{ matches: { path, line, text }[], truncated }`, and `history(text, { paths, limit })`, which returns `{ entries: { commit, at, subject, change: "added" | "removed" }[], truncated }`, newest first. A consumer that only reads snapshots is unaffected.

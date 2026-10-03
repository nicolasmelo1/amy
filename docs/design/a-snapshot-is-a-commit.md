# A snapshot is a commit, and it can be searched

[Grooming reads the code it is about](grooming-reads-the-code-it-is-about.md)
gave a grooming step a read-only view of each repository at its base branch.
The view is a file reader and nothing else. `BaseSourceSnapshot` carries
`repo`, `baseBranch` and `read(path)` (`packages/core/src/ports/BaseSource.ts:5`).
That is not enough to answer the question the design doc was written for,
which is *"does something here already do this?"*

## The question it was built for, and why it cannot answer it

The exhibit in that design doc is a ticket that adds a column. On the day it
was groomed the ticket was correct. Fifteen days later somebody else shipped
the column under another ticket, and the work was cancelled after code had
been written. Catching it takes three facts, and the snapshot gives one:

| what grooming needs | what the snapshot gives |
| --- | --- |
| the code as it is **today** on the base branch | the code as it was the last time anything fetched |
| **where** a name appears, without knowing the file first | `read(path)`, for a path you already know |
| **which commit** introduced it, and which commit the answer was read at | nothing: no revision, no history |

The private workflow that first tried to use the snapshot for this wants to write
`exists_today` with the revision it was read at, and to cut a ticket while
naming the commit that made it unnecessary. Neither can be done through the
port today, and the workflow cannot fill the gap itself: the design doc
deliberately gives grooming no checkout path, branch or commit, so it cannot
run `git` on its own.

## Three defects in what is there

**It never fetches.** `GitBaseSource.snapshot` checks that `origin/<base>`
exists and reads from it (`BaseSource.ts:36-46`). Nothing before it runs
`git fetch`. The only fetch in the core is `Git.prepareBranch`
(`packages/core/src/git.ts:139`), which runs when a work item gets a branch,
and grooming runs before any work item exists. On a machine where nobody
started a ticket in a repository for two weeks, the snapshot is two weeks old,
and it says *"the column does not exist"* about a column that shipped twelve
days ago. That is the exhibit, reproduced by the tool built to prevent it.

**It is not pinned.** `rev-parse --verify origin/<base>` resolves a commit and
then throws it away. Every `read` asks for `origin/<base>:<file>` again. Any
fetch in between, from a ticket in another phase or from the operator's own
shell, means two reads in one grooming run can come from two different commits.
A step that compares a migration with the model that uses it can see half of
a change.

**It cannot say what it read.** No revision is returned. A claim about the code
is a claim about the code on one commit. Without the commit, nobody can check
the claim later or tell when it went stale.

## The change

`BaseSourceSnapshot` becomes a commit with a reader, a search and a history,
all pinned to that commit:

```ts
export interface BaseSourceSnapshot {
  readonly repo: string;
  readonly baseBranch: string;
  /** The full commit id every method below reads at. */
  readonly revision: string;
  /** When that commit was made, as ISO 8601. */
  readonly committedAt: string;
  read(path: string): Promise<string | null>;
  /** Where a text appears at `revision`. Literal by default. */
  search(text: string, options?: { paths?: string[]; regex?: boolean; limit?: number }): Promise<SearchResult>;
  /** Commits up to `revision` that added or removed occurrences of a text. */
  history(text: string, options?: { paths?: string[]; limit?: number }): Promise<HistoryResult>;
}

export interface SearchResult {
  matches: { path: string; line: number; text: string }[];
  /** True when `limit` cut the list. A cut list must not read as "nothing else". */
  truncated: boolean;
}

export interface HistoryResult {
  /** Newest first. */
  entries: HistoryEntry[];
  /**
   * True when `limit` cut the list. Without it, the oldest entry of a cut
   * list would read as the commit that introduced the text, which is the one
   * claim `history` exists to make.
   */
  truncated: boolean;
}

export interface HistoryEntry {
  commit: string;
  at: string;
  subject: string;
  /** Whether the commit raised or lowered the number of occurrences. */
  change: "added" | "removed";
}
```

And `GitBaseSource.snapshot` does, in order:

1. `git fetch origin +refs/heads/<base>:refs/remotes/origin/<base>`, with the
   destination named. A bare `git fetch origin <base>` updates
   `origin/<base>` only if the checkout's `remote.origin.fetch` maps that
   branch: [the refspecs given on the command line decide what is fetched, and
   the configured ones only decide where it is stored](https://git-scm.com/docs/git-fetch#_configured_remote_tracking_branches).
   In a checkout whose refspec was narrowed, the fetch would succeed and step 2
   would still resolve the old ref. This writes only the remote-tracking ref.
   `git fetch` leaves local branches and the working tree alone, so it keeps
   the design doc's promise that the standing checkout stays where its owner
   left it. A failed fetch is refused, naming the repository and git's own
   words. A stale answer to *"does this exist"* is the defect this plan is
   about, so serving one quietly is not a fallback.
2. `git log -1 --format=%H%x00%cI origin/<base>`, which gives the commit id
   and its committer date in one call against one ref. They are kept as
   `revision` and `committedAt`. Every later call names that id, never
   `origin/<base>`, so nothing after this step reads the moving branch.
3. `read(path)` becomes `git show <revision>:<path>`.
4. `search` becomes [`git grep`](https://git-scm.com/docs/git-grep) against
   the tree of `revision` (*"instead of searching tracked files in the working
   tree, search blobs in the given trees"*), with `-F` unless `regex` is set,
   `-n`, `-I` and `-z`, and the paths after `--`. `-I` skips binary blobs,
   which git would otherwise report as `Binary file … matches` with no line or
   text to put in a match. Grooming searches source, so a binary is not a
   match. `-z` ends the path with a NUL, so a path containing `:` still
   parses. The tree prefix git adds to every path is stripped, so `path` is a
   repository path a later `read` accepts.
5. `history` becomes [`git log -S<text>`](https://git-scm.com/docs/git-log)
   ending at `revision`: the commits where the number of occurrences of the
   text changed, which is how the fifteen-day gap in the exhibit was found by
   hand. Whether a commit added or removed is read from the count on each side
   of the commit, not guessed from the subject. A commit that moves the text
   between files leaves the count where it was and reads as `added`: the text
   still exists after it. A merge is searched with `--diff-merges=remerge`,
   by what its conflict resolution changed rather than what its branch
   brought in, so a text that first appeared while resolving a conflict is
   named and a clean merge does not repeat its branch's commit. `limit` asks
   git for one more than it returns, and the extra entry is what sets
   `truncated`.

Without a `limit`, `search` returns at most 200 matches and `history` at most
50 commits, and says so through `truncated` when that cut the list.

Every argument reaches git as an argv element. Nothing goes through a shell,
and a `text` that starts with `-` is passed after `-e` (grep) or bound to
`-S` (log), so it cannot be read as a flag.

## What stays the same

- **Still read-only.** Grooming still gets no checkout path, branch, worktree
  or a git it can run. The three new things are answers, not capabilities. The
  fetch is the only write, and it writes to a ref nobody works on.
- **The core still parses no section.** It returns matches and commits. What
  counts as *"already exists"*, and whether a ticket is cut, stays with the
  workflow.
- **`groomFeature` needs no change to keep working.** It only consumes
  snapshots, and a consumer is unaffected by members it does not read.

## This is a breaking change for implementers

It is additive for a consumer and not for an implementer. A type that
structurally implements `BaseSourceSnapshot` stops compiling, and the
interface is exported, so a plugin outside this repository can be one. Inside
it, the only other implementer is the literal in
`packages/workflow-feature-grooming/tests/groom.test.ts:48`.

The members stay required. Making `search` and `history` optional would push
an `if` into every groomer, and a groomer that skipped the check would answer
*"nothing found"* from a source that cannot search, which is the stale answer
this plan exists to remove. So:

- `@amykit/core` takes a `minor` changeset, which is how this repository marks
  a breaking change below 1.0, as *the workflow contract changes once* did.
  The changeset names the members to implement.
- Every implementer in this repository is migrated in the same pull request,
  and the build is what proves none was missed.

## What is not in this

**Recording the revision in the brief.** Where `read_at` lives and how a
re-run notices it moved belongs to the workflow, which owns the brief's
sections.

**Search across repositories, or semantic search.** One repository per
snapshot, plain text or a regex. A model does the reading. The port only has
to make the reading honest.

**History beyond the base branch.** A change on an unmerged branch is not
something the base already does, and asking about it is the half-finished-branch
mistake the design doc already refuses.

## Acceptance criteria

- [x] A snapshot fetches the base branch before resolving it, and a commit
      pushed to the remote after the checkout's last fetch is visible to it
      (proof: assertion:groom.the_snapshot_sees_what_was_pushed_since_the_last_fetch)
- [x] A failed fetch refuses the snapshot, naming the repository and git's
      error, and does not fall back to the old ref
      (proof: test:packages/core/tests/BaseSource.test.ts)
- [x] A snapshot carries the full commit id and its commit time, and every
      read, search and history call names that id rather than `origin/<base>`
      (proof: test:packages/core/tests/BaseSource.test.ts)
- [x] A commit fetched while a snapshot is in use changes none of its answers
      (proof: assertion:groom.a_snapshot_is_pinned_to_its_commit)
- [x] `search` finds a literal text at the snapshot's commit and returns paths
      `read` accepts; a text the working tree has and the base does not is not
      found (proof: assertion:groom.search_reads_the_base_not_the_tree)
- [x] A search cut by its limit says so (proof: test:packages/core/tests/BaseSource.test.ts)
- [x] `history` names the commit that introduced a text, and the one that
      removed it, up to the snapshot's commit and no further
      (proof: assertion:groom.history_names_the_commit_that_added_it)
- [x] A history cut by its limit says so, and an uncut one does not
      (proof: test:packages/core/tests/BaseSource.test.ts)
- [x] A fetch updates `origin/<base>` in a checkout whose `remote.origin.fetch`
      does not map the base branch
      (proof: assertion:groom.the_fetch_names_its_destination)
- [x] A binary blob that contains the text is not returned as a match, and a
      path containing `:` is returned whole
      (proof: test:packages/core/tests/BaseSource.test.ts)
- [x] A text beginning with `-` is searched for, never read as a flag
      (proof: test:packages/core/tests/BaseSource.test.ts)
- [x] The grooming step still receives no checkout path, branch, worktree or
      runner (proof: test:packages/workflow-feature-grooming/tests/groom.test.ts)

**Exit condition:** grooming a feature whose column was pushed by somebody
else after this machine last fetched finds that column, names the commit that
added it, and reports the commit it read at, all through the snapshot and with
the standing checkout exactly where it was. The `feature-grooming` gate's
scenario drives exactly that against a real remote.

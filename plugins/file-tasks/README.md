# @amy/plugin-file-tasks

Tasks as a directory of files, written by `amy btw` or by hand.

```text
~/.amy/tasks/task-20260905T100000.md
```

```markdown
---
repo: acme/widgets
source: ada, mid-conversation
added: 2026-09-05T10:00:00.000Z
---

bump the stale deps in the api package
```

Markdown with a three-line header rather than JSON, for the same reason the
notes use one: a task has to be writable by an editor, by a hook, or by a
shell one-liner. A format only a program can produce would have made this a
programmatic interface with a directory in front of it.

The file name is the id, so a task written by hand is indistinguishable from
one `amy btw` wrote. Both are work somebody wants done, and neither is more
real than the other.

## Why not the notes directory

Because they are opposites. A **note** is friction that happened, and it
becomes a plan in the repository it is about. A **task** is work somebody
wants done, and it becomes a pull request or an answer. One workflow reads
each; mixing them into one directory would make both of them guess.

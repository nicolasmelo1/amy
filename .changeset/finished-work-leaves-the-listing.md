---
"@amykit/cli": minor
---

`amy status` stops listing work that has finished.

A record in a terminal state is done: `discover` already refuses to queue it,
so it costs nothing to keep — but it never left the listing on its own, and a
list that only grows stops being read. Finished records are counted below the
table instead, `amy status --all` prints them, and `--json` marks each record
with `finished` so a page can make the same cut. Nothing is deleted and the
log still keeps what the work did.

Nothing is hidden when the workflow will not mount, because a mount that
failed is exactly when somebody wants every row.

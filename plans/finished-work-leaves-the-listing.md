# Finished work leaves the listing

`amy status` is the one page somebody keeps open, and it only grows.

`terminalStates` is a list — it is meant to be several, and `workflow-revv` has
two (`DONE` and `REVIEW_POSTED`). `Worker.discover` reads it and refuses to
re-enqueue work that reached one (`plugins/serial-engine/src/Worker.ts:109`).
So a finished record is not reprocessed and no agent is spent on it. That part
is right and this plan does not touch it.

What a finished record still costs is a line. On one install after three days:
`REVV-7716` finished, `TBO-1201` finished, both still listed, and the list only
grows. The page somebody keeps open becomes the page they stop reading.

`amy status` does not even know they are finished. It is handed the waiting
states and not the terminal ones (`packages/cli/src/index.ts:681`), so it
prints a `DONE` record as `active`. The JSON carries `terminalStates`; the
human output does not use it.

## Counted, not deleted

Nothing is removed here. The terminal record *is* the safeguard that stops
rediscovery: delete it while the tracker still returns the id and `found()`
offers the id again, no record exists to be recognised as terminal, and the
whole lifecycle starts over from the beginning. Removing an ended record is
retention's job, and it has its own plan —
[Work that is over goes away](work-that-is-over-goes-away.md).

So the listing hides what the store keeps, and says how much it is hiding.

The several terminal states need no ceremony here either. They differ in what
happened — handed to QA, descoped, review posted — and not at all in whether
the work is over. The log is where the difference is kept.

One case is not hidden: a workflow that will not mount. There are no terminal
states to compare against then, and a mount that failed is exactly when
somebody wants every row.

## What changes

- `amy status` is told the terminal states it already receives in JSON, and
  stops calling finished work active.
- A record in a terminal state is counted below the table rather than printed.
  `amy status --all` prints it anyway.
- `--json` marks each record `finished`, so a page rendering the same data can
  make the same cut.

## Acceptance criteria

- [ ] `amy status` prints a terminal record as finished rather than active,
      and leaves it out of the listing altogether unless `--all` is passed
      (proof: test:packages/cli/tests/status.test.ts)
- [ ] Nothing is hidden when the workflow will not mount, and no state is
      called waiting or active on a guess
      (proof: test:packages/cli/tests/status.test.ts)
- [ ] The ticket that reached `DONE` in the end-to-end run is counted and not
      listed, and `--all` still shows it
      (proof: assertion:lifecycle.finished_work_leaves_the_listing)

**Exit condition:** a machine that has driven work for a month lists what is
happening and not what has happened, and nothing has been deleted to achieve
it.

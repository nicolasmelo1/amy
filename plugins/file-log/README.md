# @amy/plugin-file-log

The event log, as one JSON Lines file per day.

Mounts nothing. It is the append-only record of everything that happened, and
the single source four separate things read: `amy observe` reads it, the
budget ledger aggregates it, the reporter projects it, and a human reads it
when something went wrong. Giving each of those its own state is how they end
up disagreeing with each other.

## Why JSON Lines, and why one file per day

A line per event, appended and never rewritten. One file per day so the
directory stays readable and an old day can be dropped without touching the
current one. JSON Lines so a crash mid-write costs the last line rather than
the file, and a malformed line is skipped rather than fatal.

## What it may contain

This log is local and may name the work it is about. Anything leaving the
machine is projected and scrubbed at **that** boundary, never here, so the
operator's own view is not crippled in order to protect a report.

# @amy/plugin-file-store

The work record, as one file per item.

Mounts the `store` role. Generic over the record, because the shape past the
four fields the core reads belongs to whichever workflow is mounted.

## Written then renamed

A record is written to a sibling file and renamed into place. A crash
mid-write would otherwise leave a half-written record that fails to parse on
the next look, which turns one bad moment into a stuck ticket.

One file per ticket, so a record can be read and edited by hand when something
has gone wrong. Do not edit one while a tick could be running.

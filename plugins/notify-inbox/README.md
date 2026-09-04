# @amy/plugin-notify-inbox

Announcements as a file on disk, plus a desktop notification.

A `Channel` for `@amy/plugin-notify-fanout`.

## The file is the durable half

A notification that is missed is gone. The file stays until it is dealt with,
which is why the question is written **before** the notification is raised.
`amy status` counts what is waiting.

## The AppleScript detail

The notification text is flattened to one line and its quotes escaped, because
a newline or an unescaped quote in a ticket title would otherwise break the
`osascript` literal and the notification would silently not appear.

## Settings

| Setting | Default | |
| :-- | :-- | :-- |
| `directory` | `needs-input` | where questions are left, relative to the workspace |

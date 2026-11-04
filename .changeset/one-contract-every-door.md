---
---

The plans now put one contract ahead of the server. amy's rules move out of the
command line into domains of `@amykit/services`, and the command line, the
server's routes and the SDK are generated from that contract rather than
written. A plugin declares operations instead of commands, so installing one
adds a command, a route and an SDK method at once. Nothing published changes.

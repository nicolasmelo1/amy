---
"@amykit/core": patch
---

A frozen adapter, such as `Object.freeze({ name, register })`, mounts again
through the host that only takes declarations. The proxy that keeps a
plugin's own receiver stood on the plugin itself. Replacing `register` on a
frozen object breaks a Proxy invariant, so it threw a `TypeError` before
registration ran. It now stands on an empty object of its own and still reads
and calls every member on the plugin.

---
"@amykit/core": patch
"@amykit/workflow-ticket-to-qa": patch
"@amykit/agent-kit": patch
"@amykit/plugin-linear": patch
"@amykit/plugin-agent-relay": patch
"@amykit/plugin-command-gate": patch
"@amykit/plugin-github": patch
"@amykit/plugin-serial-engine": patch
---

The ports belong to the core.

`Tracker`, `Agent`, `Gate`, `Ticket` and the outcome contracts they carry
moved from `@amykit/workflow-ticket-to-qa` to `@amykit/core`, beside
`CodeHost` and `Harness`, so a workflow nobody shipped declares every port
it needs by importing `@amykit/core` and no plugin in the install depends
on a workflow package to know what a tracker is. The workflow re-exports
every name for one minor version so nothing breaks on the way past, and
the tracker contract grows a declared write surface: reads
(`TrackerReads`) and writes (`TrackerWrites`) are separate interfaces a
mount can hand out separately, with `TRACKER_WRITE_CAPABILITIES` naming
what each core action resolves to.

---
"@amykit/core": patch
"@amykit/agent-kit": patch
"@amykit/cli": patch
"@amykit/plugin-file-store": patch
"@amykit/plugin-linear": patch
"@amykit/workflow-ticket-to-qa": patch
---

A brief reaches every ticket it explains.

Tickets may inherit a shared brief from their Linear parent. The workflow reads
that brief freshly on every observation, carries it to triage, implementation,
review and its self-review half-step, records questions against it, and keeps a
brief only while its explained work remains non-terminal or inside retention.
`amy brief <id>` renders the mounted brief without exposing its store path.

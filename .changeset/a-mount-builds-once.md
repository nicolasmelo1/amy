---
"@amykit/core": minor
"@amykit/cli": minor
"@amykit/plugin-agent-relay": minor
"@amykit/plugin-serial-engine": minor
"@amykit/workflow-errand": minor
"@amykit/workflow-note-to-plan": minor
"@amykit/workflow-ticket-to-qa": minor
---

**A mount builds once.** `port`, `engine` and `contribute` accept `deferred(() => impl)`: the host builds it once every plugin has registered, once per mount and before any `ready`, building on demand when one reads another, so the order plugins are listed in does not matter. A build that throws is a boot refusal naming its plugin, and two builds that read each other are refused naming both. The agent relay, the serial engine and the three shipped workflows use it in place of their own `WeakMap<PluginContext, …>`, getter proxies and build-early `ready`. One behaviour change: the serial engine is now built at boot, so an engine with no workflow, no runtime or no queue, store or notifier is refused when the host mounts rather than on its first tick.

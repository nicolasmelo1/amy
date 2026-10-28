# A mount builds once

Five plugins need something that another plugin registers, possibly after
them: the agent relay needs the harnesses, the serial engine needs the workflow,
its runtime and the queue, and each of the three workflows needs the ports its
runtime calls. [Plugins](../docs/concepts/plugins.md) promises that the order
plugins are listed in is not something an operator has to get right, and all
five keep that promise by hand, each in its own way:

- a `WeakMap<PluginContext, …>` per module, because the exported plugin is a
  module singleton and a field on it would leak between hosts in one process
  (`plugins/agent-relay`, and all three `packages/workflow-*`);
- a `ready(ctx)` that does nothing but build the thing early, so a missing port
  is a boot refusal rather than a crash on the first tick;
- in the workflows, a hand-written proxy that forwards every member of
  `WorkflowRuntime` — `policy`, `progress`, `found`, `newRecord`, `observe`,
  `actions`, `apply` — through a getter or a closure to the lazily built one,
  each repeating the member's full signature;
- in the serial engine, a `let` and a `??=` instead, which is the same idea
  written a fifth way.

That is roughly a hundred lines in each workflow's `plugin.ts`, and three traps
[Write a workflow](../docs/build/write-a-workflow.md) has to call
"load-bearing" because an author who misses any one of them ships a bug that
only shows up with two mounts, or with a different plugin order, or on the first
tick instead of at boot. The host is the only thing that knows when every
plugin has registered. Knowing it is its job.

## What changes

The registry accepts a deferred implementation wherever an implementation is
registered today — `port`, `engine` and `contribute`:

```ts
registry.port("agent", deferred(() => relay(ctx)));
registry.contribute(WORKFLOW_RUNTIME, "errand", deferred(() => errandRuntime(…)));
```

The marker is explicit, rather than "any function", because a contribution
that is itself a function is a legitimate thing to register.

Once every plugin has registered, the host builds every deferred
implementation, once per mount, and before any `ready`. A deferred
implementation that reads another one through `ctx.port` or
`ctx.contributions` gets it built on demand, so the order they are listed in
still does not matter; two that read each other are refused at boot, naming
both. A build that throws is the same refusal a `register` that throws already
is, naming the plugin. Whoever reads a port or a contribution receives the
built object, never the factory.

An implementation passed directly keeps working exactly as it does today, so
this is additive.

The five plugins move onto it. Their `WeakMap`s, the getter proxies and every
`ready` whose only job was to build early are deleted. `ready` itself stays,
for a plugin that has something to judge once everything is mounted.

## Acceptance criteria

- [ ] A port whose implementation is deferred and needs a port listed after
      it in the config mounts, and gets that port
      (proof: test:packages/core/tests/mount.test.ts)
- [ ] A deferred implementation that throws is a boot refusal naming its
      plugin, and two that read each other are refused naming both
      (proof: test:packages/core/tests/mount.test.ts)
- [ ] Two hosts mounted in one process build two instances, and each mount
      builds its own exactly once
      (proof: test:packages/core/tests/mount.test.ts)
- [ ] A relay ladder naming a harness nobody contributed is still refused at
      boot, without the relay holding a `WeakMap` or building in `ready`
      (proof: deferred:test:plugins/agent-relay/tests/plugin.test.ts)
- [ ] No module under `plugins/` or `packages/workflow-*` keys anything by
      `PluginContext`
      (proof: test:packages/core/tests/architecture.test.ts)
- [ ] The three shipped workflows still walk their scenarios with nothing in
      them changed but the wiring
      (proof: assertion:plan.work_injected_by_command_reaches_the_queue)

**Exit condition:** `grep -rn "WeakMap<PluginContext" plugins packages` outside
`dist/` and the core's own mount finds nothing, and every scenario the e2e
script runs is green.

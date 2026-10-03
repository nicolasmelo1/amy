# @amykit/agent-kit

The part of "being an agent" that is the same whichever harness answers.

Not a plugin. A library the harness plugins and the workflows share, so that
adding a harness means teaching amy a **command line**, and writing a step
means writing a **prompt**.

## What is here

**`Harness`** is the whole surface a harness has to implement:

```ts
interface Harness {
  readonly name: string;
  ask(prompt: string, cwd: string, context?: AskContext): Promise<HarnessReply>;
}
```

One method, and the `agent` port is the same one method. A harness answers in
the directory it is handed and never touches git: when work is committed and
pushed is the workflow's decision
([an agent only answers](../../docs/design/an-agent-only-answers.md)).

**`implementStep`** and **`judgeStep`** are what a workflow builds a step
with, on any agent:

```ts
// Ask for a change; commit it through the function you pass.
const { value } = await implementStep(agent, {
  prompt, cwd, context: { workId, step: "implement" },
  commit: () => git.commitAndPush(repo, branch, message, workId),
});

// Ask a question whose answer is one JSON object, and read it.
const { value } = await judgeStep(agent, {
  prompt, cwd, context: { workId, step: "triage" },
  read: (answer) => readTriage(answer, at),
  fallback: unreadTriage(at),
});
```

**`HarnessRelay`** is one harness made of several: a skill ladder for who
should do a step and a harness ladder for what to do when the one asked ran
out of quota or was not up to it, both keyed by the `step` in the context.

**`contributeTiers`** adds one `NamedHarness` per model tier to the collection
the relay reads. The naming lives here rather than in each plugin because it
is a contract: `claude:opus` is what an operator writes in a ladder, so three
plugins inventing three conventions would make the config unlearnable.

## Why a harness contributes instead of mounting

A port has exactly one owner. Three harnesses that each mounted `agent` would
refuse to mount together, which is the correct behaviour for a port and the
wrong outcome here.

So a harness contributes a `NamedHarness` and `@amykit/plugin-agent-relay` is
the only thing that mounts the port. A single-harness install goes through the
relay too, with a ladder one rung long and nothing special about that case.

`harness` and `model` are declared on each rung rather than discovered from a
result, because the relay has to decide **where to go next** before it runs
anything.

## A decision every step inherits

**A clean exit that changed nothing is a failure.** `implementStep` commits
as the context's `verify`, which the relay calls after each rung that
completed, so a rung that changed no file hands the step to the stronger model
or the next skill, and the attempt that changed nothing on every rung reports
`unchanged` progress. Reporting success would send an empty pull request to a
reviewer.

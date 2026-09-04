# @amy/agent-kit

The part of "being an agent" that is the same whichever harness answers.

Not a plugin. A library the harness plugins share, so that adding a harness
means teaching amy a **command line**, not re-teaching it the job.

## What is here

**`Harness`** is the whole surface a harness has to implement:

```ts
interface Harness {
  readonly name: string;
  ask(prompt: string, cwd: string): Promise<HarnessReply>;
}
```

One method. Everything else about being useful to a ticket lives in
`HarnessAgent`, which turns that one method into the `agent` port: the triage,
implement and review-answering prompts, the JSON the replies are read out of,
and the git dance around each call.

**`contributeTiers`** adds one agent per model tier to the collection the
relay reads. The naming lives here rather than in each plugin because it is a
contract: `claude:opus` is what an operator writes in a ladder, so three
plugins inventing three conventions would make the config unlearnable.

## Why a harness contributes instead of mounting

A port has exactly one owner. Three harnesses that each mounted `agent` would
refuse to mount together, which is the correct behaviour for a port and the
wrong outcome here.

So a harness contributes a `NamedAgent` and `@amy/plugin-agent-relay` is the
only thing that mounts the port. A single-harness install goes through the
relay too, with a ladder one rung long and nothing special about that case.

`harness` and `model` are declared on each `NamedAgent` rather than discovered
from a result, because the relay has to decide **where to go next** before it
runs anything.

## Two decisions inherited by every harness

**A clean exit that changed nothing is a failure.** The ticket asked for work.
Reporting success would send an empty pull request to a reviewer.

**An unanswered review comment becomes a disagreement, not a silence.** A
comment the agent did not answer is pushed to the owner rather than dropped.

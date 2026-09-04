# @amy/plugin-claude

The `claude` CLI as the agent.

Contributes one agent per model tier to the collection
`@amy/plugin-agent-relay` reads. It does not mount the `agent` port itself:
a port has one owner, and three harnesses that each wanted to be *the* agent
would refuse to mount together.

Every call runs in the ticket's own checkout, on the
branch the tracker named, and anything the agent leaves behind is committed
and pushed: the machine's notion of "implemented" means the work is on the
remote, because that is what a pull request can be opened against.

## Two decisions that are not obvious

**A clean exit that changed nothing is a failure.** The ticket asked for work.
Finishing without touching a file is not it, and reporting success would send
an empty pull request to a reviewer.

**An unanswered review comment becomes a disagreement, not a silence.** If the
agent does not answer a comment it was given, that comment is pushed to the
owner rather than dropped. An unanswered review comment is the one thing that
must never disappear.

## It asks for JSON, and that is what makes it measurable

`--output-format json` returns the answer, the token counts, the cost the
harness itself worked out, and an error status. Every one of those is read off
the envelope rather than guessed from stderr.

That matters most for one distinction: a **rate limit** and a **failure** want
opposite responses. A quota problem is not a capability problem, so a stronger
model does not help and another harness does. Guessing between them from log
text is how a relay ends up spending an expensive model on a throttle.

A cost the harness reported wins, because it knows the plan and the discounts.
Failing that, `@amy/model-specs` computes one and the run says
`costSource: "computed"`. A model nothing can price leaves the cost absent, not
zero: zero is a number a budget would happily spend.

**Known limit:** a rate limit severe enough that no envelope is printed
classifies as `abandoned`. That is honest rather than clever, and when a real
throttled envelope is in hand its shape goes into the classifier.

## The flag that does not exist

`claude` accepts `--model`, not `-m`. Passing `-m` makes Commander reject the
whole invocation before any work happens, and the prompt is streamed over
stdin rather than passed as an argument.

## Settings

| Setting | Default | |
| :-- | :-- | :-- |
| `model` | `""` | passed as `--model` |
| `reviewerHints` | `{}` | guidance appended per reviewer, by host login |
| `timeoutMs` | 30 min | how long one call may run |

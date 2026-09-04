# @amy/plugin-agent-relay

One agent made of several, and the only thing that decides which harness
answers.

Mounts the `agent` port. The harnesses do not: they contribute themselves to a
collection this reads, because a port has one owner and three harnesses that
each wanted to be *the* agent would refuse to mount together.

**It is not optional.** Nothing else mounts `agent`, so dropping it from a
config leaves every agent action without a port and `mount()` refuses at boot.

## The policy, by cause

The reason this is not a plain retry loop: the two causes want opposite moves.

| Cause | Where it goes |
| :-- | :-- |
| `rate-limited` | the next **harness**, skipping every remaining model of the throttled one |
| `failed` | the next **model** of the same harness, then the next harness |
| `abandoned` | nowhere |
| `completed` | nowhere |

**A rate limit is not a capability problem.** A stronger model sits behind the
same quota that just refused, so trying it wastes a call to learn nothing.

**A failure might be.** So it walks both axes: stronger model first, then a
different harness, and only escalates to you once the whole ladder is spent. A
harness bug is not fixed by a bigger model behind it.

**`abandoned` stops the ladder, and that is a safety property.** It means the
child was killed or the binary does not exist. Retrying the first would raise
a fresh process at the exact moment somebody ran `amy stop`, so the handbrake
would stop braking. A missing binary is `amy doctor`'s job, before a ticket is
ever touched.

One honest limitation: only the claude envelope publishes a quota status.
Codex and Hermes report a throttle as `failed`, because inventing the
distinction from stderr text is exactly what this design refuses. The ladder
still reaches another harness, just one rung later than it could.

## The handoff continues, it does not restart

The working tree is left exactly as the cut-off harness left it, and the next
one is told it is picking up half-done work, along with whatever the previous
one said. Resetting would throw away the part that was already right, and on a
long ticket that is expensive enough to risk hitting the same quota again.

Only `implement` carries that context, because it is the only method of the
port with a channel for it.

Every swap is one `agent.handoff` line: harness, model, cause, and which axis
moved. That is what the `reliability` dimension of the logion report is
computed from.

## Settings

| Setting | Default | |
| :-- | :-- | :-- |
| `ladder` | `[]` | which contributed agents to try, in order. Empty means all of them, in mounting order |

The names come from the harness plugins: `claude:sonnet`, `codex:gpt-5`, or a
bare `claude` for a single-model install. A name nobody contributed is
**refused at boot** rather than skipped, because a ladder with a typo in it
would quietly be shorter than you believe and the first symptom would be a
ticket escalating for no reason.

In practice you write the ladder in `agent:` and the CLI derives the rest: it
is also what decides which harness plugins get mounted at all.

```yaml
agent:
  ladder: [claude:sonnet, claude:opus, codex:gpt-5]
```

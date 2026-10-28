# A decision is asked of a port

Every decision this machine takes is one of two kinds. The decisions about
**state** are code: `plan(record, obs, policy)`
(`packages/workflow-ticket-to-qa/src/machine.ts:27`) is pure and runs over
observations already typed, so the testkit can replay it and every
transition says why. Those stay exactly as they are. The other kind turns
**text into a category**, and today it goes one of two ways. Either a fixed
default decides without reading anything, or a whole agent run decides by
writing prose that something then has to parse.

`readAs` (`packages/workflow-ticket-to-qa/src/discussion.ts:13`) is the
fixed-default case:

```ts
return said.kind ?? (policy.conversation === "discuss" ? "discussion" : "decision");
```

A reply nobody marked reads as whatever `policy.conversation` says, whatever
the reply says. Under `answer`, "why do you think that comment is wrong?" is a
decision and the work resumes on a question, which is the defect that
`docs/design/a-question-is-not-an-answer.md` made opt-in rather than fixed.
Under `discuss`, "go with option B" is one more turn, and the person has to
find the button.

A decision model is the tool built for this. It takes some context, a
question and a closed set of answers, and returns one answer with a
probability. It writes no prose, and it is fast and cheap enough to ask on
every look. Several of them exist as of October 2026, and they agree on the
shape:

- **OpenAI's Decisions API:** predicate, choice and score questions.
- **TypeSafe's Jev:** choice with confidence.
- **Cloudflare's Clef and Clef-flash:** a Jev-compatible API, with open weights.
- **Supersonic Labs' Julia-1:** an open 144M encoder that runs on a CPU.
- **Qwen-based models served locally:** the same shape, with the answer
  constrained to an enum.

None of them should be wired in by name. This plan is the seam: the port, the
ladder in front of it, and the record of what it said. The plans after it
add the models.

## What changes

**A `Decider` port in the core**, `packages/core/src/ports/Decider.ts`, in its
own file and naming no product:

```ts
export type Question =
  | { kind: "predicate"; ask: string }
  | { kind: "choice"; ask: string; answers: readonly string[] }
  | { kind: "score"; ask: string; levels: readonly string[] };

export interface Verdict {
  answer: string;
  /** The probability the decider gave `answer`, as it reported it. */
  confidence: number;
  probabilities?: Readonly<Record<string, number>>;
}

export interface Decider {
  decide(context: string, question: Question): Promise<Verdict | "unsure" | "unreachable">;
}
```

The plugin declares the limits a decider has: the most answers it takes (20
for an encoder like Julia-1) and the longest context it reads. It declares
them for the same reason a harness declares `pricesItsOwnRuns`: only the
plugin knows them, and a question over the limit is refused at boot rather
than truncated at run time. `unsure` is a refusal or an answer below the
rung's threshold. `unreachable` is a decider that could not be asked: a model
not downloaded, a server not running, a network down.

**A question is declared by name.** The workflow declares each decision it is
willing to hand to a model, as a name, a question and the answer it falls
back to when nobody decided. For `ticket-to-qa` the first is `reply-kind`.
The name is what `config.yaml` attaches a ladder to, and what the record
carries.

**A ladder of deciders, each with a threshold:**

```yaml
decide:
  reply-kind:
    - { decider: local, accept: 0.92 }
    - { decider: hosted, accept: 0.85 }
```

The first rung that answers at or above its `accept` decides. Below it, the
next rung is asked. `unreachable` skips to the next rung, the way a
rate-limited rung skips its harness (`packages/agent-kit/src/ladder.ts`).
When every rung is spent, the question's fallback decides, so an install
with no decider behaves exactly as it does today. The ladder lives in
`packages/agent-kit/src/deciders.ts`, beside the harness ladder it mirrors.

**The verdict is an observation, and it is recorded.** The runtime asks the
ladder while it builds the observation, never inside `plan()`. The record
keeps the question's name, which rung decided (or that the fallback did),
the answer and the confidence. `plan()` reads that and stays pure, the
testkit replays a run without asking anybody, and a transition a model chose
names the model that chose it.

**`readAs` is the first question.** `policy.conversation` gains a third value,
`read`: an unmarked reply is put to the `reply-kind` ladder. A reply the
person marked still reads as marked under every policy, and the adapter
still never guesses, so the rule in `Reply.kind`
(`packages/core/src/ports/Conversation.ts:20`) holds. The model is asked by
the workflow, under its policy, and the adapter is never involved.

The fallback under `read` is `discussion`, not `decision`, because the two
mistakes do not cost the same. A decision read as a discussion costs one
answer in the thread and a person saying "yes, go". A discussion read as a
decision resumes the work on a question, which is the defect *a question is
not an answer* was written about. So an unsure reply goes the cheap way,
and a ladder that sets `accept` for `decision` above `accept` for
`discussion` is the expected configuration, not a special case.

**The testkit gets a scripted decider.** A world can say what a decider
answers to a given context and how sure it is, or that it is unreachable, so
a walkthrough proves the ladder and the fallback without a model.

## What does not change

- **`plan()` and every state decision:** no model takes them, and no
  confidence reaches a transition except through a recorded verdict.
- **Agent steps that need to read code:** triage of a ticket, implementation
  and self-review stay with the harness. A decider reads the context it is
  handed and nothing else.
- **`answer` and `discuss`:** both read exactly as they do today, and `answer`
  stays the default.

## What comes after

Once the seam exists, three more questions want it. They are not rows until
`reply-kind` has run on real threads:

- **Review triage.** *A strong model reads the review first* puts each thread
  into misunderstanding, real, or already settled. A decider can take the
  common case and leave the strong model the threads it is unsure of.
- **Repeat detection.** *Decisions are asked in a batch* needs to know whether
  a disagreement is new or a repeat of a subject already settled.
- **The first rung.** The harness ladder starts every step on its cheapest
  rung. A score question could pick the starting rung from how hard the
  ticket reads.

## Acceptance criteria

- [ ] `Decider`, `Question` and `Verdict` are exported from the core, in
      their own file, and name no product
      (proof: deferred:test:packages/core/tests/ports.test.ts)
- [ ] A question with more answers than a rung's declared limit is refused at
      boot naming the question and the rung
      (proof: deferred:test:packages/agent-kit/tests/deciders.test.ts)
- [ ] The first rung at or above its threshold decides; a rung below it, or
      unreachable, hands to the next; a spent ladder returns the question's
      fallback (proof: deferred:test:packages/agent-kit/tests/deciders.test.ts)
- [ ] With no decider installed and no `decide` key, every walkthrough that
      passes today passes unchanged
      (proof: deferred:walkthrough in the testkit)
- [ ] Under `conversation: read`, an unmarked question read as `discussion`
      gets an answer in the thread and moves nothing, and an unmarked reply
      read as `decision` above its threshold resumes the work
      (proof: deferred:walkthrough in the testkit)
- [ ] Under `conversation: read`, a reply the ladder is unsure of reads as a
      discussion, and a marked reply reads as marked whatever the ladder says
      (proof: deferred:test:packages/workflow-ticket-to-qa/tests/discussion.test.ts)
- [ ] The record names the question, the rung that decided or the fallback,
      the answer and its confidence, and a replay of that record asks no
      decider (proof: deferred:walkthrough in the testkit)

**Exit condition:** a workflow hands one named question to a ladder of
deciders from `config.yaml`. With nothing installed it behaves as it does
today, and every answer a model gave is on the record with the model's name
and how sure it was.

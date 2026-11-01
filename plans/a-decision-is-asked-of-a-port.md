---
sources:
  - { id: S1, kind: code, ref: "packages/workflow-ticket-to-qa/src/machine.ts:27", said: "plan(record, obs, policy) is pure over typed observations; the testkit replays it and every transition says why. State decisions stay as they are" }
  - { id: S2, kind: code, ref: "packages/workflow-ticket-to-qa/src/discussion.ts:13", said: "readAs: an unmarked reply reads as policy.conversation says (discuss → discussion, else decision), whatever the reply says" }
  - { id: S3, kind: reference, ref: "docs/design/a-question-is-not-an-answer.md", said: "under answer a question resumes the work; under discuss 'go with option B' is one more turn. The doc made the reading opt-in, not fixed" }
  - { id: S4, kind: decision, said: "a decision model takes context, a question and closed answers, returns one answer with a probability, writes no prose, and is cheap enough to ask on every look" }
  - { id: S5, kind: reference, said: "October 2026: OpenAI Decisions API (predicate/choice/score), TypeSafe Jev (choice+confidence), Cloudflare Clef/Clef-flash (Jev-compatible, open weights), Supersonic Labs Julia-1 (open 144M CPU encoder), local Qwen with enum-constrained answers" }
  - { id: S6, kind: decision, said: "no model is wired in by name; this plan is the seam (port, ladder, record) and later plans add the models" }
  - { id: S7, kind: decision, ref: "packages/core/src/ports/Decider.ts", said: "Question: predicate {ask} | choice {ask, answers} | score {ask, levels}. Verdict: answer, confidence as reported, optional probabilities. decide(context, question) → Verdict | 'unsure' | 'unreachable'" }
  - { id: S8, kind: decision, said: "the plugin declares its most answers (20 for an encoder like Julia-1) and longest context, as a harness declares pricesItsOwnRuns; over a limit is refused at boot, not truncated at run time" }
  - { id: S9, kind: decision, said: "unsure: a refusal or an answer below the rung's threshold. unreachable: could not be asked (model not downloaded, server not running, network down)" }
  - { id: S10, kind: decision, said: "the workflow declares each question by name, with its fallback answer; ticket-to-qa's first is reply-kind. config.yaml attaches a ladder to the name; the record carries it" }
  - { id: S11, kind: decision, said: "`decide: { reply-kind: [{ decider: local, accept: 0.92 }, { decider: hosted, accept: 0.85 }] }`: the first rung at or above its accept decides; below, the next is asked" }
  - { id: S12, kind: code, ref: "packages/agent-kit/src/ladder.ts", said: "unreachable skips a rung as rate-limited skips a harness; a spent ladder takes the fallback, so no decider behaves as today. Lives in agent-kit/src/deciders.ts beside the harness ladder" }
  - { id: S13, kind: decision, said: "the runtime asks the ladder while building the observation, never inside plan(); the record keeps question name, deciding rung or fallback, answer and confidence" }
  - { id: S14, kind: decision, said: "plan() reads the recorded verdict and stays pure; a replay asks nobody; a transition a model chose names that model" }
  - { id: S15, kind: decision, said: "policy.conversation gains read: an unmarked reply goes to the reply-kind ladder; a marked one reads as marked under every policy. The workflow asks, never the adapter" }
  - { id: S16, kind: code, ref: "packages/core/src/ports/Conversation.ts:20", said: "Reply.kind: the adapter never guesses; this holds under read" }
  - { id: S17, kind: decision, said: "read falls back to discussion: a misread decision costs one answer and 'yes, go'; a misread discussion resumes work on a question. accept for decision above discussion's is the expected configuration" }
  - { id: S18, kind: decision, said: "a testkit world scripts what a decider answers a context and how sure, or that it is unreachable, so walkthroughs prove ladder and fallback without a model" }
touches:
  - packages/core/src/ports/Decider.ts
  - packages/core/src/index.ts
  - packages/core/tests/ports.test.ts
  - packages/agent-kit/src/deciders.ts
  - packages/agent-kit/src/index.ts
  - packages/agent-kit/tests/deciders.test.ts
  - packages/workflow-ticket-to-qa/src/discussion.ts
  - packages/workflow-ticket-to-qa/src/observation.ts
  - packages/workflow-ticket-to-qa/src/plugin.ts
  - packages/workflow-ticket-to-qa/src/record.ts
  - packages/workflow-ticket-to-qa/src/runtime.ts
  - packages/workflow-ticket-to-qa/tests/discussion.test.ts
  - packages/workflow-testkit/src/world.ts
  - packages/cli/src/config.ts
criteria:
  - { id: A1, statement: "Decider, Question and Verdict are exported from the core, in their own file, and name no product", proof: "deferred:test:packages/core/tests/ports.test.ts", sources: [S4, S5, S6, S7] }
  - { id: A2, statement: "a question with more answers than a rung's declared limit is refused at boot naming the question and the rung", proof: "deferred:test:packages/agent-kit/tests/deciders.test.ts", sources: [S8] }
  - { id: A3, statement: "the first rung at or above its threshold decides; a rung below it, or unreachable, hands to the next; a spent ladder returns the question's fallback", proof: "deferred:test:packages/agent-kit/tests/deciders.test.ts", sources: [S9, S10, S11, S12] }
  - { id: A4, statement: "with no decider installed and no decide key, every walkthrough that passes today passes unchanged", proof: "deferred:walkthrough in the testkit", sources: [S12, S18] }
  - { id: A5, statement: "under conversation: read, an unmarked question read as discussion gets an answer in the thread and moves nothing; an unmarked reply read as decision above its threshold resumes the work", proof: "deferred:walkthrough in the testkit", sources: [S2, S3, S15, S18] }
  - { id: A6, statement: "under conversation: read, a reply the ladder is unsure of reads as a discussion, and a marked reply reads as marked whatever the ladder says", proof: "deferred:test:packages/workflow-ticket-to-qa/tests/discussion.test.ts", sources: [S15, S16, S17] }
  - { id: A7, statement: "the record names the question, the rung that decided or the fallback, the answer and its confidence, and a replay of that record asks no decider", proof: "deferred:walkthrough in the testkit", sources: [S1, S13, S14] }
crosses:
  - { mechanism: record-migration, answer: works, proof: "deferred:A4, a saved record with no verdict plans as today" }
  - { mechanism: attempts-and-waits, answer: n/a, why: "a decider is asked while the observation is built, not as an agent run, so no attempt is charged or given back" }
  - { mechanism: agent-replies, answer: n/a, why: "a decider returns a typed Verdict, unsure or unreachable, never prose; harness replies are untouched" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "the Decider port only answers a question; it writes nothing to the tracker or the code host" }
  - { mechanism: config, answer: works, proof: "deferred:A2, A4" }
  - { mechanism: workflow-tooling, answer: n/a, why: "the testkit's world gains a scripted decider; its walk of states and edges is unchanged" }
guarantee:
  - { holds: "no model takes plan() or any state decision; no confidence reaches a transition except through a recorded verdict" }
  - { holds: "agent steps that read code (ticket triage, implementation, self-review) stay with the harness; a decider reads only the context it is handed" }
  - { holds: "answer and discuss read exactly as they do today, and answer stays the default" }
cut:
  - "later, after reply-kind runs on real threads: review triage (a strong model reads the review first), a decider takes the common misunderstanding/real/settled case, leaving unsure threads to the strong model"
  - "later: repeat detection, new versus already-settled disagreement (decisions are asked in a batch)"
  - "later: a score question picks the harness ladder's first rung from how hard the ticket reads"
exit: "a workflow hands one named question to a ladder of deciders from config.yaml. With nothing installed it behaves as today, and every answer a model gave is on the record with the model's name and how sure it was"
---
# A decision is asked of a port

Text-to-category decisions are made today by a fixed default that reads nothing, or by a whole agent run writing prose that must be parsed.

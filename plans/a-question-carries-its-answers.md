---
base: 4482c7ece52bd28a54c1aa30ecbd133ba0310ef9
sources:
  - { id: S1, kind: friction, said: "2026-11-04: amy asked in the work thread, and answering it meant typing out what a button would have said; the reply then had to be read as discussion or decision before anything moved" }
  - { id: S2, kind: decision, said: "a question can carry its answers: approve or reject, pick one, pick several. Wanted in every adapter that implements Conversation and can show it, not only the window; Slack and Telegram first, as early as possible. Decided 2026-11-05" }
  - { id: S3, kind: reference, ref: "packages/core/src/ports/Conversation.ts", said: "post takes { text, files? }; Reply carries text, files and kind?, set only when the medium marked it; the adapter never guesses" }
  - { id: S4, kind: reference, ref: "docs/design/a-question-is-not-an-answer.md", said: "a reply is a discussion turn, a decision, or unmarked, and what unmarked text means is the workflow's policy, never the adapter's" }
  - { id: S5, kind: reference, ref: "https://github.com/coleam00/archon", said: "Archon's wait node asks with form: message | approval | select | multi_select, and a rejection is an answer the workflow branches on, not an error" }
  - { id: S6, kind: decision, said: "the port gains Ask { id, prompt, form: approval | choice | choices, answers: string[] }; approval's answers are always [approve, reject]; post takes an optional ask; Reply gains answer?: { ask: string; chosen: string[] }" }
  - { id: S7, kind: decision, said: "an answer is always marked: a reply carrying one is a decision under every policy.conversation, since a pressed answer is the person saying so" }
  - { id: S8, kind: decision, said: "an adapter says it can ask with asks: true; a workflow posting an ask to one that cannot posts the prompt and its answers as a numbered list instead, and the reply reads as today" }
  - { id: S9, kind: decision, said: "the first answer to an ask is the answer; a later one is not returned, and the adapter says once in the thread which answer was taken" }
  - { id: S10, kind: reference, ref: "https://api.slack.com/interactivity/handling", said: "a Block Kit button click reaches an app only at a public Request URL or over Socket Mode; plugin-slack polls the Web API and has neither" }
  - { id: S11, kind: decision, said: "Slack: real buttons when Socket Mode is on, numbered reactions otherwise; both come back as the same answer. Decided 2026-11-05" }
  - { id: S12, kind: decision, ref: "plugins/slack/src/SlackConversation.ts", said: "this row ships the reactions: approval is ✅ and ❌ on amy's message, choice is one keycap 1️⃣..🔟, choices is keycaps then ✅ to send; only the configured operator's reactions count, as only their replies do" }
  - { id: S13, kind: decision, said: "a choice or choices ask with more than ten answers cannot be shown as reactions, so Slack without Socket Mode posts it as the numbered list of S8" }
  - { id: S14, kind: reference, ref: "plans/an-event-is-a-reason-to-look.md", said: "S16 there makes Socket Mode a setting, off by default; the Block Kit half of S11 lands with that setting, not before it exists" }
  - { id: S15, kind: reference, ref: "https://core.telegram.org/bots/api", said: "an inline keyboard's press arrives as a callback_query update through the same getUpdates, once callback_query is in allowed_updates" }
  - { id: S16, kind: decision, ref: "plugins/telegram/src/TelegramConversation.ts", said: "Telegram: an inline keyboard under amy's message; choices toggles a ✓ per press and sends on Send; every press is acknowledged with answerCallbackQuery; callback_data is the ask id and answer index, under 64 bytes" }
  - { id: S17, kind: reference, ref: "packages/workflow-ticket-to-qa/src/agent-steps.ts", said: "triage returns questions: string[], posted by ask-question as a bulleted list" }
  - { id: S18, kind: reference, ref: "docs/design/no-port-method-ships-unproven.md", said: "a port member no shipped workflow calls has nothing proving it works" }
  - { id: S19, kind: decision, said: "ticket-to-qa is the first caller: triage may give a question its closed answers, ask-question posts each such question as an ask, and the chosen answer goes back to triage beside the question, as a typed reply does today" }
  - { id: S20, kind: decision, said: "the window's half lands with the window: the transcript carries asks and answers, addThreadTurn takes an answer, the thread panel shows buttons; written into those two plans, not built here. Decided 2026-11-05" }
  - { id: S21, kind: reference, ref: "plans/next-steps.md", said: "every row is proven in the end-to-end scenario of a workflow this repository ships, through the installed executable, with the assertion that workflow's gate requires" }
  - { id: S22, kind: decision, said: "an answer is what one look reads: a Slack approval showing both ✅ and ❌, or a choice showing two keycaps, is no answer; amy says once which marks it saw and waits. Decided 2026-11-05" }
  - { id: S23, kind: reference, ref: "plugins/serial-engine/src/Worker.ts", said: "a look reads replies before the budget check, the triage run and the save; a look that fails or is parked is retried from the same since" }
  - { id: S24, kind: decision, said: "replies is a function of the thread and since: a retry from the same since gets the accepted answer again, and only a different later answer is dropped. Decided 2026-11-05" }
  - { id: S25, kind: decision, said: "an adapter keeps no accepted answer in memory: it recomputes it from the thread on every call, and Telegram writes each press to its state directory when it arrives, since getUpdates keeps updates 24 hours. Decided 2026-11-05" }
  - { id: S26, kind: decision, said: "an ask's answers are 2 to 10 distinct, non-empty strings, each within the medium's button-label limit; anything else, from triage or any caller, is posted and read as a plain question. Decided 2026-11-08" }
  - { id: S27, kind: decision, said: "only a keycap within range, ✅ or ❌ on an approval, and ✅ on a choices ask are marks; any other reaction (7️⃣ on three answers, ✅ on a single choice) is ignored and competes with nothing. Decided 2026-11-08" }
  - { id: S28, kind: decision, said: "an accepted answer is sticky: Slack writes it to its state directory as Telegram writes each press, so a mark removed later does not undo it; S25's recompute stops once an ask is answered. Decided 2026-11-08" }
touches:
  - .software-factory/evidence/ticket-to-qa/**
  - .software-factory/policy.yaml
  - packages/core/src/ports/Conversation.ts
  - packages/core/src/index.ts
  - packages/core/tests/ports.test.ts
  - plugins/slack/src/SlackConversation.ts
  - plugins/slack/src/config.ts
  - plugins/slack/tests/SlackConversation.test.ts
  - plugins/slack/tests/SlackConversation.asks.test.ts
  - plugins/slack/tests/every-method-is-exercised.test.ts
  - plugins/telegram/src/TelegramConversation.ts
  - plugins/telegram/src/BotApi.ts
  - plugins/telegram/tests/TelegramConversation.test.ts
  - plugins/telegram/tests/TelegramConversation.asks.test.ts
  - plugins/telegram/tests/every-method-is-exercised.test.ts
  - plugins/telegram/tests/stand-in.ts
  - examples/workflow-ticket-to-qa/src/agent-steps.ts
  - examples/workflow-ticket-to-qa/src/effects.ts
  - examples/workflow-ticket-to-qa/src/actions.ts
  - examples/workflow-ticket-to-qa/src/machine.ts
  - examples/workflow-ticket-to-qa/src/record.ts
  - examples/workflow-ticket-to-qa/tests/agent-steps.test.ts
  - examples/workflow-ticket-to-qa/tests/walkthrough.test.ts
  - examples/workflow-ticket-to-qa/tests/asks.property.test.ts
  - packages/workflow-testkit/src/world.ts
  - docs/concepts/ports.md
  - plans/every-endpoint-is-named-before-it-is-built.md
  - plans/a-conversation-before-the-work.md
  - plans/an-event-is-a-reason-to-look.md
criteria:
  - { id: A1, statement: "Ask, its three forms and Reply.answer are exported from the core and name no product", proof: "deferred:test:packages/core/tests/ports.test.ts", sources: [S3, S5, S6, S20] }
  - { id: A2, statement: "an approval ask in Slack is posted with ✅ and ❌ on amy's message, and the operator's ✅ comes back from replies as answer { ask, chosen: [approve] } with kind decision", proof: "deferred:test:plugins/slack/tests/SlackConversation.asks.test.ts", sources: [S6, S7, S10, S11, S12, S14] }
  - { id: A3, statement: "a choices ask in Slack returns the keycaps the operator put on it only once they add ✅, and a reaction by anybody else is never an answer", proof: "deferred:test:plugins/slack/tests/SlackConversation.asks.test.ts", sources: [S12] }
  - { id: A4, statement: "a choice ask with eleven answers in Slack without Socket Mode is posted as a numbered list with no reactions", proof: "deferred:test:plugins/slack/tests/SlackConversation.asks.test.ts", sources: [S8, S13] }
  - { id: A5, statement: "an approval, a choice and a choices ask in Telegram are inline keyboards; each press is acknowledged, a choices press toggles its ✓, and Send returns the chosen answers once", proof: "deferred:test:plugins/telegram/tests/TelegramConversation.asks.test.ts", sources: [S15, S16] }
  - { id: A6, statement: "for any sequence of looks over presses and reactions on one ask, replies returns at most one answer, the first complete one a look read, and none from a look showing competing marks", proof: "deferred:property:examples/workflow-ticket-to-qa/tests/asks.property.test.ts#a_later_answer_replaces_the_first", sources: [S9, S22] }
  - { id: A7, statement: "an answer reads as a decision under answer and under discuss, and an unmarked typed reply to the same ask reads as it does today", proof: "deferred:property:examples/workflow-ticket-to-qa/tests/asks.property.test.ts#an_answer_reads_as_policy_says", sources: [S4, S7] }
  - { id: A8, statement: "an adapter without asks: true is posted the prompt and numbered answers as text, and the walkthrough passes on it unchanged", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/walkthrough.test.ts", sources: [S8] }
  - { id: A9, statement: "a triage question with answers reaches CLARIFYING as an ask, the operator's chosen answer goes back to triage beside its question, and the ticket leaves CLARIFYING on it", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/walkthrough.test.ts", sources: [S1, S2, S17, S18, S19] }
  - { id: A10, statement: "a triage reply whose answers are not a list of strings is read as a plain question, never refused", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/agent-steps.test.ts", sources: [S17] }
  - { id: A12, statement: "in the ticket-to-qa scenario, through the installed executable, a stand-in Slack ✅ on an ask moves the ticket out of CLARIFYING with the choice beside its question", proof: "deferred:assertion:lifecycle.an_ask_is_answered_by_a_press", sources: [S19, S21] }
  - { id: A13, statement: "for any ask answered once, replies from the same since returns that same answer on every call, after an adapter restart too, in Slack and Telegram alike, a mark removed after the answer was accepted included", proof: "deferred:property:examples/workflow-ticket-to-qa/tests/asks.property.test.ts#a_replay_loses_the_answer", sources: [S23, S24, S25, S28] }
  - { id: A14, statement: "an ask whose answers are fewer than 2, more than 10, repeated, empty or longer than the medium's button label is posted as a plain question with no marks or keyboard", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/agent-steps.test.ts", sources: [S26] }
  - { id: A15, statement: "in Slack a keycap outside the ask's range, and ✅ on a single choice, are ignored: neither answers nor competes with an answer", proof: "deferred:test:plugins/slack/tests/SlackConversation.asks.test.ts", sources: [S27] }
  - { id: A16, statement: "in Slack, a reaction removed after a look accepted its answer leaves that answer returned, after an adapter restart too", proof: "deferred:test:plugins/slack/tests/SlackConversation.asks.test.ts", sources: [S28] }
crosses:
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "Conversation.ts gains an optional ask on post and an optional answer on Reply; with no conversation mounted, ask-question comments the numbered list on the tracker exactly as it comments the questions today" }
  - { mechanism: events-and-notifications, answer: works, proof: "deferred:A2, A3, A4" }
  - { mechanism: agent-replies, answer: works, proof: "deferred:A10" }
  - { mechanism: record-migration, answer: works, proof: "deferred:A9, a record saved with questions as strings plans as today" }
  - { mechanism: attempts-and-waits, answer: works, proof: "deferred:A13; a look retried after a failure or a budget park reads the accepted answer again" }
  - { mechanism: workflow-tooling, answer: works, proof: "deferred:A8, the testkit world's conversation answers an ask as scripted" }
guarantee:
  - { holds: "only the configured operator's press or reaction is an answer, as only their reply is one today", not_against: "a person holding the operator's own Slack or Telegram account" }
  - { holds: "one ask has one answer, the first complete one a look read; a change of mind after it is a new reply in the thread, read by policy", not_against: "the order of reactions made between two looks, which polling cannot see" }
  - { holds: "an ask is shown as a form only with 2 to 10 distinct, non-empty answers that fit a button; every other ask is a plain question", not_against: "two answers that differ only in a way the person cannot see, such as trailing spaces or look-alike characters" }
  - { holds: "only a keycap within range, ✅ or ❌ on an approval, or ✅ on choices, is a mark; once accepted, an answer survives its mark being removed", not_against: "a mark removed before any look read it, which polling cannot see" }
  - { holds: "a form never stops the typed reply: the person can always answer in words, and it reads as it reads today", not_against: "a workflow whose own code ignores text replies to a question it asked as a form" }
failures:
  - { step: replies, when: "one look sees competing marks on an ask: ✅ and ❌, or two keycaps on a choice", goes_to: "no answer; amy says once in the thread which marks it saw, and the next look reads again" }
  - { step: post, when: "the adapter has no asks, or Slack without Socket Mode is given more than ten answers", goes_to: "the prompt and its answers as a numbered list; the reply reads as typed text" }
  - { step: post, when: "Slack refuses a reaction amy adds to its own message", goes_to: "the message stands as posted with its numbered list, and the operator may react by hand or type" }
  - { step: replies, when: "a press or reaction arrives after the ask was answered", goes_to: "not returned; the adapter says once in the thread which answer was taken" }
  - { step: replies, when: "a Telegram callback names an ask this thread never posted", goes_to: "acknowledged with 'this question is no longer open' and dropped" }
cut:
  - "Slack Block Kit buttons before the Socket Mode setting exists: they land in an-event-is-a-reason-to-look"
  - "a free-text 'other' answer inside the form: the typed reply already is one"
  - "a decision model choosing an ask's answer from typed text: later, behind a-decision-is-asked-of-a-port"
  - "asks in the tracker: amy's tracker writes are questions in words only"
exit: "amy asks a ticket's open question in Slack with ✅ and ❌ and in Telegram with buttons, the owner presses one, and the ticket leaves CLARIFYING on that press with the choice recorded beside the question"
---
# A question carries its answers

amy asks in words and reads the answer as words, so a yes-or-no costs a typed
sentence and a guess about whether it was a decision. A question that knows its
answers can be shown as buttons wherever the conversation can show them, and
the press comes back typed, marked, and already a decision.

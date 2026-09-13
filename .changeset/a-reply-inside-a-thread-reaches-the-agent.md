---
"@amykit/core": patch
"@amykit/plugin-github": patch
"@amykit/agent-kit": patch
---

A reply inside a review thread reaches the agent.

`ReviewThread` carried the first comment of a thread and nothing that
followed it, so a reviewer's correction written inside the thread sat one
field away from every consumer: `address-threads` handed the agent what the
thread *started* with, and "whose turn is it" was a question the view could
not answer. The port grows `comments` — the conversation, oldest first,
opening comment included — and `author`/`body` stay the opening comment's,
so a consumer that never asked for the conversation is unaffected and
`comments.at(-1)?.author` answers whose turn a thread is from the view
alone. The GitHub query asks for `comments(first: 50)` with `createdAt` in
the same request, and the adapter maps the list. The `address-threads`
prompt renders the conversation attributed — a later comment is introduced
as a reply, not restated as the objection — and says that a later comment
answers the earlier ones, so an agent handed a correction inside the thread
is handed the correction.
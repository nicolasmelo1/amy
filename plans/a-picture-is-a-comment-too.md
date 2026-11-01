---
sources:
  - { id: S1, kind: code, ref: "packages/core/src/ports/Ticketing.ts", said: "Comment.body is a plain string; ReviewThread.body the same (CodeHost.ts); prompts render them as text. An attachment is not in the body, so the agent never sees it" }
  - { id: S2, kind: code, ref: "plugins/linear/src/LinearTracker.ts", said: "LinearTracker.comments asks for body and drops what came beside it; GitHubCodeHost's thread mapping keeps the comment text and nothing else" }
  - { id: S3, kind: friction, ref: "issue #50", said: "the Linear and GitHub plugins must receive attachments in description or comments; an image, or one with circles, must be information the agent can work with. Every workflow reading these ports has the hole" }
  - { id: S4, kind: decision, said: "Comment gains optional attachments?: readonly Attachment[]; Attachment is { url: string; kind: \"image\" | \"file\"; title?: string }, as the tracker holds it" }
  - { id: S5, kind: decision, said: "optional and absent in every existing response: no adapter breaks and no workflow changes behaviour until a tracker returns one" }
  - { id: S6, kind: reference, ref: "docs/design/a-reply-inside-a-thread-reaches-the-agent.md", said: "ReviewThread.comments, the thread conversation, grows the same attachments field, so a picture in a thread reply is carried" }
  - { id: S7, kind: decision, said: "Linear: description query grows attachment nodes (ride the issue node) and comments query grows attachments { url title }. Both adapters translate native shape to Attachment; the port carries the URL, not bytes" }
  - { id: S8, kind: decision, said: "GitHub: map markdown image occurrences (!, alt text in square brackets, URL in parentheses) in comment bodies, plus the attachments array GitHub's API carries for uploaded media" }
  - { id: S9, kind: decision, said: "conversationLines renders each attachment as a line; threadPrompt renders a thread's attachments beside its text; the harness (Claude Code, Hermes, Codex), which already accepts image URLs, reads the image itself. No pixels pass through amy" }
  - { id: S10, kind: decision, said: "vision is the harness's word: a harness that cannot read an image says so and the run reports it in the existing outcome vocabulary. amy never grows an image-parsing dependency" }
  - { id: S11, kind: decision, said: "the gate is ticket-to-qa, extended: the lifecycle is where a conversation with a picture is read. Assertions picture.an_attached_image_reaches_the_agent_prompt and picture.a_thread_with_circled_evidence_is_worked_not_escalated" }
  - { id: S12, kind: decision, said: "the ticket-to-qa gate also asserts picture.a_tracker_comment_without_attachments_renders_as_today and picture.an_attachment_url_the_harness_cannot_open_is_reported_not_swallowed" }
touches:
  - packages/core/src/ports/Ticketing.ts
  - packages/core/src/ports/CodeHost.ts
  - plugins/linear/src/LinearTracker.ts
  - plugins/linear/tests/LinearTracker.test.ts
  - plugins/github/src/GitHubCodeHost.ts
  - plugins/github/tests/GitHubCodeHost.test.ts
  - packages/workflow-ticket-to-qa/src/agent-steps.ts
  - packages/workflow-ticket-to-qa/tests/agent-steps.test.ts
  - packages/test-fixtures/src/fakes.ts
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "Comment and thread replies carry attachments as URLs with a kind, absent when there were none", proof: "test:plugins/linear/tests/LinearTracker.test.ts", sources: [S4, S5, S6] }
  - { id: A2, statement: "a Linear description or comment attachment reaches the prompt", proof: "test:plugins/linear/tests/LinearTracker.test.ts", sources: [S2, S7, S9] }
  - { id: A3, statement: "a GitHub comment image reaches the thread prompt as a URL", proof: "test:plugins/github/tests/GitHubCodeHost.test.ts", sources: [S2, S8, S9] }
  - { id: A4, statement: "an agent handed a comment with an image works the evidence, not the escalation", proof: "assertion:picture.a_thread_with_circled_evidence_is_worked_not_escalated", sources: [S1, S3, S11] }
  - { id: A5, statement: "a conversation with no attachments renders exactly as before the field existed", proof: "test:packages/workflow-ticket-to-qa/tests/agent-steps.test.ts", sources: [S5] }
  - { id: A6, statement: "an attachment the harness cannot open fails the run honestly", proof: "assertion:picture.an_attachment_url_the_harness_cannot_open_is_reported_not_swallowed", sources: [S10, S12] }
crosses:
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "the adapters and ports only read more fields; no write to the tracker or code host is added" }
cut:
  - "an image-parsing dependency inside amy: refused; the harness reads the picture (S10)"
  - "passing image bytes through amy: refused; a URL the harness can open is the whole contract (S9)"
exit: "a comment that arrives with a picture is a comment the agent can see, on Linear or GitHub alike, and no workflow has to know that pictures were ever missing"
---
# A picture is a comment too

Every conversation amy reads arrives as prose. A comment saying "look at the screenshot" says nothing to an agent that never saw the screenshot, and the machine escalates "the agent did not answer this comment" on evidence the agent was never shown.

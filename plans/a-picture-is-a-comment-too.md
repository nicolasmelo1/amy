# A picture is a comment too

Every conversation amy reads arrives as prose. `Comment.body` is a
plain string (`packages/workflow-ticket-to-qa/src/ports/Tracker.ts:13`),
`ReviewThread.body` the same (`packages/core/src/ports/CodeHost.ts:14`),
and the prompts render them as text
(`packages/agent-kit/src/HarnessAgent.ts:232`). A comment that says
"look at the screenshot" with a screenshot attached says nothing to the
agent: the attachment is not in the body, the body is not the picture,
and an agent that never saw the evidence cannot work the finding —
whether the circles mark the wrong rows on an invoice screen or the
wrong edge of a layout.

Both trackers hold more than prose. Linear carries attachments on the
description and on comments; GitHub carries images in comments. The
adapters fetch neither: `LinearTracker.comments` asks for `body`
(`plugins/linear/src/LinearTracker.ts:136`) and drops what came beside
it, and `GitHubCodeHost`'s thread mapping keeps the comment text
(`plugins/github/src/GitHubCodeHost.ts:326`) and nothing else. The
machine compensates by escalating — "the agent did not answer this
comment" — on evidence the agent was never shown.

The user-facing finding (issue #50): the Linear plugin must be able to
receive attachments in description or comments, and the GitHub plugin
likewise — a comment with an image of something wrong, or an image with
circles, must be information the agent can work with. The failure is
not one workflow's; every workflow reading a conversation through
these ports has the same hole.

## What changes

**The conversation carries its pictures.** `Comment` gains:

```ts
/** Attachments the comment carried, as the tracker holds them. */
attachments?: readonly Attachment[];
```

with `Attachment` a URL and what it is:

```ts
interface Attachment {
  /** Where the bytes are, as the tracker names it. */
  url: string;
  /** What the tracker says it is: an image, a file, a page. */
  kind: "image" | "file";
  /** The tracker's own name for it, when it has one. */
  title?: string;
}
```

Optional on the interface and absent in every existing response, so no
tracker adapter breaks and no workflow changes behaviour until a
tracker actually returns one. `ReviewThread.comments` — the thread
conversation the sibling plan carries
([a-reply-inside-a-thread-reaches-the-agent.md](a-reply-inside-a-thread-reaches-the-agent.md))
— grows the same field, so a picture in a thread reply is carried too.

**The adapters fetch what the trackers hold.** Linear: the description
query grows its attachment nodes and the comments query grows theirs
(`issue.comments` nodes carry `attachments { url title }` in Linear's
schema; description-level attachments ride the issue node). GitHub:
comment bodies hold image links in markdown, and the adapter maps the
markdown image occurrences — an exclamation mark, alt text in square
brackets, then the URL in parentheses — plus the `attachments` array
GitHub's API carries for uploaded media. Both adapters translate their
tracker's native shape into `Attachment` and leave the fetching to the
reader — the URL is what the port carries, not the bytes.

**The prompt renders the picture as evidence.** The harness prompt for
a conversation or a thread with attachments names them and hands the
URLs over, and the harness — Claude Code, Hermes, Codex — reads the
image itself: the harnesses amy drives already accept image URLs in
prompts. `conversationLines` renders each attachment as a line, and
`threadPrompt` renders a thread's attachments beside its text
(`packages/agent-kit/src/HarnessAgent.ts:211`). No pixels pass through
amy; a URL the harness can open is the whole contract.

**`vision` is the harness's word, not amy's.** A harness that cannot
read an image is a harness that says so, and the agent run reports it —
the existing run outcome vocabulary answers. Amy never grows an
image-parsing dependency of its own; the ports carry the URL, the
harness does or does not see the picture, and the honest answer is what
the run says.

## The gate

`ticket-to-qa`, extended — the lifecycle is where a conversation with a
picture in it is read:

- `picture.an_attached_image_reaches_the_agent_prompt`
- `picture.a_thread_with_circled_evidence_is_worked_not_escalated`
- `picture.a_tracker_comment_without_attachments_renders_as_today`
- `picture.an_attachment_url_the_harness_cannot_open_is_reported_not_swallowed`

## Acceptance criteria

- [ ] `Comment` and thread replies carry attachments as URLs with a
      kind, absent when there were none
      (proof: test:plugins/linear/tests/LinearTracker.test.ts)
- [ ] A Linear description or comment attachment reaches the prompt
      (proof: test:plugins/linear/tests/LinearTracker.test.ts)
- [ ] A GitHub comment image reaches the thread prompt as a URL
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [ ] An agent handed a comment with an image works the evidence, not
      the escalation
      (proof: assertion:picture.a_thread_with_circled_evidence_is_worked_not_escalated)
- [ ] A conversation with no attachments renders exactly as before the
      field existed
      (proof: test:packages/agent-kit/tests/HarnessAgent.test.ts)
- [ ] An attachment the harness cannot open fails the run honestly
      (proof: assertion:picture.an_attachment_url_the_harness_cannot_open_is_reported_not_swallowed)

**Exit condition:** a comment that arrives with a picture is a comment
the agent can see, on Linear or GitHub alike, and no workflow has to
know that pictures were ever missing.
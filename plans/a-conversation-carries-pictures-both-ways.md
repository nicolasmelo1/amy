---
sources:
  - { id: S1, kind: friction, said: "2026-11-09: amy should read the images and videos sent on Telegram or Slack, and send images and videos back; this lives in Conversation" }
  - { id: S2, kind: code, ref: "packages/core/src/ports/Conversation.ts", said: "the port already says it: post takes files, and a Reply carries files as readable local paths" }
  - { id: S3, kind: code, ref: "plugins/slack/src/SlackConversation.ts", said: "replies download their files; post with files throws, because uploading needs files:write, which the plugin does not ask for" }
  - { id: S4, kind: code, ref: "plugins/telegram/src/TelegramConversation.ts", said: "replies download documents and photos up to the Bot API's 20 MB; a video, a video note or an animation is not read; post with files throws" }
  - { id: S5, kind: code, ref: "packages/workflow-ticket-to-qa/src/actions.ts", said: "a reply's files reach the agent as 'Attachment: <path>' lines in the prompt; whether the harness opens the image is left to it" }
  - { id: S6, kind: reference, ref: "https://docs.slack.dev/reference/methods/files.completeUploadExternal", said: "a file is uploaded with files.getUploadURLExternal, a POST to its upload_url, then files.completeUploadExternal with channel_id and thread_ts (the parent's ts); scope files:write" }
  - { id: S7, kind: reference, ref: "https://core.telegram.org/bots/api", said: "a Message carries video, video_note and animation objects with a file_id, as photo and document do" }
  - { id: S8, kind: reference, ref: "plans/a-picture-is-a-comment-too.md", said: "the tracker's side of the same gap: a picture on a Linear or GitHub comment" }
  - { id: S9, kind: decision, said: "a video is handed to the agent as the frames sampled from it plus the path, because harnesses read images and not video; the sampling is the host's, the harness is unchanged. Proposed 2026-11-09" }
  - { id: S10, kind: decision, said: "a file too large for the medium is not dropped: the post goes out with a line naming the file and its local path, as replies already do for a file too large to download. Proposed 2026-11-09" }
  - { id: S11, kind: code, ref: "packages/test-fixtures/src/contracts/slack.ts", said: "the Slack stand-in holds every call to the vendored contract, which describes neither files.getUploadURLExternal nor files.completeUploadExternal; the upload is added to it from Slack's own reference, not bypassed" }
touches:
  - plugins/slack/src/SlackApi.ts
  - plugins/slack/src/SlackConversation.ts
  - plugins/slack/src/plugin.ts
  - plugins/slack/tests/SlackConversation.test.ts
  - plugins/slack/tests/every-method-is-exercised.test.ts
  - plugins/slack/README.md
  - plugins/telegram/src/BotApi.ts
  - plugins/telegram/src/TelegramConversation.ts
  - plugins/telegram/tests/TelegramConversation.test.ts
  - plugins/telegram/tests/every-method-is-exercised.test.ts
  - plugins/telegram/README.md
  - packages/agent-kit/src/attachments.ts
  - packages/agent-kit/src/index.ts
  - packages/test-fixtures/src/contracts/slack.ts
  - packages/agent-kit/tests/attachments.test.ts
  - packages/workflow-ticket-to-qa/src/actions.ts
  - docs/concepts/ports.md
criteria:
  - { id: A1, statement: "post with a PNG and an MP4 on Slack uploads both into the work's thread under its parent message, and the doctor check names files:write when the token lacks it", proof: "deferred:test:plugins/slack/tests/SlackConversation.test.ts", sources: [S1, S2, S3, S6, S11] }
  - { id: A2, statement: "post with a PNG and an MP4 on Telegram sends a photo and a video into the work's topic", proof: "deferred:test:plugins/telegram/tests/TelegramConversation.test.ts", sources: [S2, S4] }
  - { id: A3, statement: "a Telegram reply carrying a video, a video note or an animation comes back with the file as a local path, as a photo does", proof: "deferred:test:plugins/telegram/tests/TelegramConversation.test.ts", sources: [S4, S7] }
  - { id: A4, statement: "a reply with an image reaches the agent as an image it is told to open, and a reply with a video as sampled frames plus the path, through the helper @amykit/agent-kit exports", proof: "deferred:test:packages/agent-kit/tests/attachments.test.ts", sources: [S5, S8, S9] }
  - { id: A5, statement: "a file over the medium's upload limit posts the text with a line naming the file and its path, and no upload is tried", proof: "deferred:test:plugins/telegram/tests/TelegramConversation.test.ts", sources: [S10] }
crosses:
  - { mechanism: events-and-notifications, answer: works, proof: "deferred:A1" }
  - { mechanism: agent-replies, answer: works, proof: "deferred:A4" }
  - { mechanism: attempts-and-waits, answer: n/a, why: "agent-kit gains a helper that turns a reply's files into what a prompt carries; no attempt or wait changes" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "the Conversation port's shape does not change; only the adapters keep the promise it already makes (S2)" }
guarantee:
  - { holds: "a file posted to or received from Slack or Telegram arrives on the other side, or a line says why it did not", not_against: "a format the medium transcodes or strips, such as Telegram compressing a photo" }
  - { holds: "an agent is handed every image and video a reply carried", not_against: "a harness that ignores the image it was told to open" }
failures:
  - { step: post, when: "the Slack token lacks files:write", goes_to: "the text is posted with a line naming the files and the missing scope; doctor is red naming it" }
  - { step: post, when: "an upload fails after the text was posted", goes_to: "a second message in the thread naming the file that did not go" }
cut:
  - "the tracker's pictures: a-picture-is-a-comment-too (S8)"
  - "transcribing voice notes: later, its own plan if asked"
  - "a new Conversation method: refused, the port already has files (S2)"
exit: "on Telegram, a person sends a screen recording of a bug; the agent describes what happens in it; amy replies in the same topic with a screenshot of the fix"
---
# A conversation carries pictures both ways

The Conversation port already promises files in both directions, but neither
adapter keeps the whole promise: Slack and Telegram download what the person
sends but refuse to send anything back, Telegram skips videos, and the agent
only ever sees a file path. This plan makes both adapters upload, makes
Telegram read videos, and hands the agent the images (and frames from the
videos) instead of their names.

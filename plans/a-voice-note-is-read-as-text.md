---
base: 813f4d270ebe164ff1c3e4b61697c6d0d63ebc87
sources:
  - { id: S1, kind: decision, said: "a plugin of its own, installed to accept audio: a voice note in the chat outside any work is answered, and a voice note answering the agent in a work's thread is read as that answer. Decided 2026-11-13" }
  - { id: S2, kind: reference, ref: "plans/a-conversation-carries-pictures-both-ways.md", said: "its cut: transcribing voice notes, later, its own plan if asked" }
  - { id: S3, kind: code, ref: "plugins/telegram/src/TelegramConversation.ts", said: "a voice note carries no answer and is skipped; a chat message with no text is never filed, so a voice note in the chat is not answered" }
  - { id: S4, kind: code, ref: "plugins/slack/src/SlackConversation.ts", symbol: "fileChatMessage", said: "a chat message with no text is never filed; a reply's files are downloaded as local paths" }
  - { id: S5, kind: code, ref: "packages/core/src/ports/Conversation.ts", said: "a Reply carries text and files as local paths; a ChatMessage carries text only" }
  - { id: S6, kind: code, ref: "plugins/notify-fanout/src/plugin.ts", said: "a deferred build reads another plugin's port with ctx.port and works without it, which is how an adapter reads an optional port" }
  - { id: S7, kind: reference, ref: "https://core.telegram.org/bots/api", said: "a Message carries voice (a Voice: file_id, duration, mime_type, file_size) or audio (an Audio, with file_name), each with an optional caption" }
  - { id: S8, kind: reference, ref: "https://docs.openclaw.ai/channels/slack/media", said: "a Slack audio clip reaches a bot as a stored file, downloaded with the bot token under files:read; observed as subtype slack_audio, mimetype audio/webm" }
  - { id: S9, kind: reference, ref: "https://github.com/ggml-org/whisper.cpp", said: "whisper-cli -m MODEL -f FILE reads 16-bit WAV only; convert with ffmpeg -ar 16000 -ac 1 -c:a pcm_s16le; ggml models from download-ggml-model.sh" }
  - { id: S10, kind: reference, ref: "https://hermes-agent.nousresearch.com/docs/user-guide/features/tts", said: "Hermes transcribes voice notes locally by default, takes other engines as providers, and with none passes the voice note through with a note to the user" }
  - { id: S11, kind: decision, said: "core gains a transcriber port, transcribe(path, language?) returning text; any plugin may mount it, so a hosted engine is another plugin, never a setting here. Proposed 2026-11-13" }
  - { id: S12, kind: decision, said: "@amykit/plugin-transcribe mounts it locally: ffmpeg to 16 kHz WAV, then whisper-cli with a configured model; no key, and no audio leaves the machine. Proposed 2026-11-13" }
  - { id: S13, kind: decision, said: "a heard voice note is read as the operator's own words, the caption first, with the audio kept among the reply's files; amy answers in text. Proposed 2026-11-13" }
  - { id: S14, kind: decision, said: "with no transcriber mounted, a voice note is never dropped: the chat answers once naming the plugin, and a reply carries a line naming the unheard file. Proposed 2026-11-13" }
touches:
  - packages/core/src/ports/Transcriber.ts
  - packages/core/src/index.ts
  - packages/core/tests/ports.test.ts
  - plugins/transcribe/package.json
  - plugins/transcribe/tsconfig.json
  - plugins/transcribe/README.md
  - plugins/transcribe/src/index.ts
  - plugins/transcribe/src/plugin.ts
  - plugins/transcribe/src/config.ts
  - plugins/transcribe/src/WhisperTranscriber.ts
  - plugins/transcribe/tests/WhisperTranscriber.test.ts
  - plugins/transcribe/tests/plugin.test.ts
  - plugins/telegram/src/TelegramConversation.ts
  - plugins/telegram/src/plugin.ts
  - plugins/telegram/tests/TelegramConversation.test.ts
  - plugins/telegram/tests/TelegramConversation.chat.test.ts
  - plugins/telegram/README.md
  - plugins/slack/src/SlackConversation.ts
  - plugins/slack/src/plugin.ts
  - plugins/slack/tests/SlackConversation.test.ts
  - plugins/slack/README.md
  - registry/core.json
  - registry/plugin-transcribe.json
  - docs/reference/plugins.md
  - docs/concepts/ports.md
  - docs/guides/the-chat.md
  - tsconfig.json
  - tsconfig.tests.json
  - vitest.config.ts
  - package-lock.json
  - .software-factory/policy.yaml
  - .software-factory/evidence/transcribe-scenario.sh
untouched:
  - packages/core/src/chat/desk.ts
criteria:
  - { id: A1, statement: "core exports the Transcriber port, and a profile that mounts no transcriber boots as before", proof: "deferred:test:packages/core/tests/ports.test.ts", sources: [S11] }
  - { id: A2, statement: "with a transcriber mounted, a Telegram voice note in the chat outside any work reaches chat() with its transcript as the text, and the desk answers it", proof: "deferred:test:plugins/telegram/tests/TelegramConversation.chat.test.ts", sources: [S1, S2, S3, S5, S6, S7] }
  - { id: A3, statement: "a Telegram voice or audio reply in a work's topic comes back as a Reply whose text is the caption then the transcript, with the audio among its files", proof: "deferred:test:plugins/telegram/tests/TelegramConversation.test.ts", sources: [S1, S3, S7, S13] }
  - { id: A4, statement: "a Slack audio clip in the chat is answered from its transcript, and one in a work's thread comes back as a Reply read the same way", proof: "deferred:test:plugins/slack/tests/SlackConversation.test.ts", sources: [S1, S4, S8, S13] }
  - { id: A5, statement: "with no transcriber mounted, a voice note in the chat gets one answer naming @amykit/plugin-transcribe, and a reply carries a line naming the unheard file", proof: "deferred:test:plugins/telegram/tests/TelegramConversation.chat.test.ts", sources: [S10, S14] }
  - { id: A6, statement: "the plugin converts the audio to 16 kHz mono 16-bit WAV, runs whisper-cli with the model and language, and returns the trimmed text; a failing command is named with its stderr", proof: "deferred:test:plugins/transcribe/tests/WhisperTranscriber.test.ts", sources: [S9, S12] }
  - { id: A7, statement: "doctor checks ffmpeg and whisper-cli on the PATH and the model file, each failure naming what to install or download", proof: "deferred:test:plugins/transcribe/tests/plugin.test.ts", sources: [S9, S12] }
  - { id: A8, statement: "the built CLI, on a stand-in Bot API and a stand-in whisper-cli, answers a voice note sent in the chat from what it said", proof: "assertion:transcribe.a_voice_note_is_answered", sources: [S1, S12] }
crosses:
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "the new port writes nothing; it reads a local file and returns text" }
  - { mechanism: events-and-notifications, answer: n/a, why: "a heard voice note is filed as the message it replaces, so no event and no notification is added or changed" }
guarantee:
  - { holds: "a voice note sent where a text would be read is answered or read as that text, or said to be unheard, never dropped", not_against: "a voice note larger than the medium lets a bot download" }
  - { holds: "with @amykit/plugin-transcribe, no audio leaves the machine", not_against: "another plugin mounting a hosted transcriber" }
failures:
  - { step: transcribe, when: "ffmpeg or whisper-cli exits non-zero or the model is missing", goes_to: "the reply carries a line naming the file and the command that failed; the chat answers that it could not hear it" }
  - { step: transcribe, when: "the transcript is empty", goes_to: "the text says no words were heard, with the file kept" }
  - { step: reading a voice note, when: "it is over the Bot API's 20 MB download limit", goes_to: "a line naming the file too large, as replies already say for any file" }
cut:
  - "amy answering with a voice note (text to speech): another plugin, if asked"
  - "a hosted engine (OpenAI, Groq): another plugin mounting the same port (S11)"
  - "the window's chat panel recording audio: once the window takes files"
  - "a voice note in a tracker comment: tracker comments carry no audio today"
exit: "with @amykit/plugin-transcribe installed, a voice note sent to amy on Telegram outside any work is answered from what it said, and one sent in a work's topic is read as the answer"
---
# A voice note is read as text

Telegram and Slack drop a voice note today: the chat never files it, and a
reply in a work's thread is read as empty. A plugin of its own, installed to
accept audio, transcribes it on this machine, so what was said is read the
way a typed message is.

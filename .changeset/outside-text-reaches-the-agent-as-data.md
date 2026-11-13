---
"@amykit/core": minor
"@amykit/workflow-ticket-to-qa": minor
---

**Outside text reaches the agent as data.** A ticket title, body, label,
comment, review thread and reply are written by somebody who is not the
operator, and they used to reach a writing agent verbatim beside its
instructions. Now every one of them travels in one closed envelope.

- **`outsideText` names its source and cannot be closed from within.** The
  source is plain text in an attribute that strips anything able to end it;
  every envelope marker in the body — plain, full-width, split with zero-width
  characters, or spelled with look-alike letters — is replaced with a note, so
  exactly one envelope opens and one closes.
- **Characters that hide or reorder text are removed, and the envelope says so
  once.** Bidi overrides, isolates and tag characters are stripped; text that
  carried none comes back byte for byte.
- **Long text is cut with a count**, so a body past the limit says how many
  characters were left out instead of ending mid-sentence with no sign.
- **A prompt says once, before the first envelope, that what is inside is
  data.** `withOutsideNotice` writes that line when, and only when, the prompt
  carries outside text. The operator's own words — the chat, an errand, a note
  and the brief — stay unfenced: they are instructions.

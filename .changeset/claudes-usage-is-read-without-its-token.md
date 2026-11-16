---
"@amykit/plugin-claude": minor
---

**Claude's usage is read without its token.** The usage reader took Claude
Code's OAuth token from the environment, `~/.claude/.credentials.json` or the
macOS Keychain and called an undocumented endpoint. It now asks Claude Code
itself for `get_usage` over a short-lived print-mode child: no model call, no
credential of the operator's, and a runner without a managed spawn reads as
unavailable.

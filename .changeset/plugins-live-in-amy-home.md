---
"@amykit/cli": minor
---

Plugins configured for an amy install now live in `~/.amy/plugins`: `amy init --install` installs them through that root rather than npm's global prefix, and mounting plus `amy plugin list` resolve from the same root.
---
"@amykit/cli": patch
"@amykit/core": patch
"@amykit/plugin-file-brief-store": patch
"@amykit/plugin-slack": patch
---

Let project phase profiles share artifacts while keeping state and spending isolated. A workflow promoted to a phase adopts the briefs it kept alone, each phase keeps its own tasks and Slack threads, and `amy stop` signals only the selected phase's daemon without touching the shared handbrake.

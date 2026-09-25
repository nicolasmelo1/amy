---
"@amykit/cli": minor
---

New `amy update` command: moves a machine forward without leaving it half-updated — reads both roots (the plugins root and the one that resolved the CLI), re-resolves every registry range through npm, installs the exact version each range now points at, and keeps the manifest's ranges the way the operator wrote them. Refuses while the loop is running; a version that will not import or mount is rolled back to the one that did; a config that will not boot fails the update and rolls back every move; and when the CLI itself moves, its skills are rewritten into the harnesses they were written into before — through the new CLI, never the old process. `amy skills` now records where it wrote, and `--recorded` rewrites into exactly those places.
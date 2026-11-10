---
"@amykit/core": minor
"@amykit/cli": patch
"@amykit/plugin-prove": patch
"@amykit/plugin-slack": patch
---

**A lock is taken one way.**

The core exports `takeLock` and `processAlive`. A lock is a file naming its
owner, published whole, so a lock being taken is never read as one its owner
abandoned; one whose owner died, or whose lease ran out unrenewed, is taken
over through a tombstone only one process can create, so of everyone who saw
the same dead owner exactly one removes it. A process that dies in the middle of
that leaves its tombstone, swept within the hour, and only then is the lock
buried again: finishing sooner could let two finishers remove a new owner's
lock. A lock an earlier version left —
a pid line, a `pid:token` line, a bare token or a directory holding
`owner.json` — is read and recovered the same way.

The daemon boundary, the config `/action` applies, a chat message's claim and
the proof's lease lock all take it, and nothing else asks whether a process
lives. The daemon boundary no longer removes a lock another process had
opened and not yet written its pid into.

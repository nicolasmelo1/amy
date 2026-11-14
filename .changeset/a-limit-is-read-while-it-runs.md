---
"@amykit/plugin-claude": minor
---

**Claude says its limit while it runs.** The harness spotted a quota only from a
429 in the final envelope, and never knew when it reset. It now reads Claude
Code's stream: a rejected `rate_limit_event` makes the run `rate-limited` with
the reset it reported, so the workflow waits for that reset instead of charging
an attempt.

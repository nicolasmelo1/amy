---
"@amykit/cli": minor
---

**A brief is groomed from its sources.**

amy ships an `amy-groom` skill: it reads the ticket and the code at a pinned
base commit, then asks one question at a time until every requirement in the
brief names its source — the ticket, a design actually opened, a decision
somebody made — and cuts the rest, with the reason. It learns the brief's
format and check from the workflow that judges it rather than carrying one,
writes a local file, and writes nothing to the tracker, the code host or chat.
Before, grooming a brief that a workflow holds tickets on had no skill in amy
at all, and requirements nobody asked for were the defect it exists to stop.

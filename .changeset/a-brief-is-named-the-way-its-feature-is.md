---
"@amykit/plugin-linear": patch
---

**A brief is named the way its feature is.**

A child ticket's `briefId` was its Linear parent's uuid, while the same parent
read as a feature (`getFeature`, `features`) was named by its identifier, and
the brief store keys a brief by that feature id. Every reader that asked the
store for `ticket.briefId` — ticket-to-qa's brief lane, a workflow looking for
a declaration file named `PROJ-1200.yaml` — found nothing, and read "no brief"
rather than failing: a ticket under a groomed feature was driven as if nobody
had groomed it. `briefId`, and `featureId` on updated groomed work, are now the
parent's identifier, and a test holds a child and its feature to one name.

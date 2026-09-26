---
"@amykit/plugin-github": patch
---

`reviewsRequestedOf` and `changesRequestedOf` work. Their GraphQL document named its variable `$query`, and the document itself travels to `gh` as the field `query`, so every call claimed that field twice and `gh` refused it before GitHub was reached: `unexpected override existing field under "query"`. The variable is `$search` now.

`submitReview` works. It sent the state a review is read as (`event=APPROVED`), and the REST API takes `APPROVE`, `REQUEST_CHANGES` and `COMMENT`. The state is mapped to the event now, and `DISMISSED`, which is not a review anyone submits, is refused.

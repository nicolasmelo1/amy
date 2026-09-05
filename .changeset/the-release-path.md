---
"@amykit/cli": minor
---

The version moves because a change said it should, and an installed package
can say which one it is.

Changesets owns the number, every `@amykit/*` package moves together through a
`fixed` group, and the bump arrives as a pull request rather than as a commit
somebody pushed. An installed package reads its identity out of a stamp
written at pack time, and a tree with uncommitted changes gets no stamp at
all — so `amy --version` says `dev` rather than naming a release that only
existed on one laptop.

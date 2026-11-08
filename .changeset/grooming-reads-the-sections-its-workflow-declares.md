---
"@amykit/core": minor
"@amykit/cli": minor
---

**Grooming reads the sections its workflow declares.**

A workflow declares the brief it asks for — `brief: { sections, check }` in
its `defineWorkflow` — and amy judges a brief against it: `amy brief sections`
lists what to answer, in order (in a project, the brief's own sections, then
each later phase's, a `prove/` scenario included); `amy brief write <id>
<section>` answers one through the brief port; and `amy brief check <id>`
exits non-zero while any phase's check, or a declared section left blank,
refuses it, naming the phase, the section and the rule. A check is handed
every operation the mounted plugins offer, so a scenario naming one nothing
offers is refused. `amy doctor` reports a brief phase that exports no check
rather than passing it.

`amy-groom` now asks the sections the workflow declares, one question at a
time in the order the check names them, and stops when it is green. Before, a
brief's readiness was judged only inside each workflow's code, with no
command to ask it, and the shipped skill asked questions of its own.

---
"@amykit/core": minor
"@amykit/cli": minor
"@amykit/workflow-pull-request": minor
"@amykit/workflow-note-to-plan": minor
"@amykit/workflow-errand": minor
"@amykit/plugin-github": minor
---

**A workflow can call another, the way code calls a function.** A diagram
marks a state `class X call`, and `calls` binds it to the workflow it calls:
`call(review, { input, config, ports, output, effects })`, every member
optional. The callee runs as a child record kept inside its caller's
(`TBO-1/REVIEW#1`), with its own history and attempts, and only the deepest
record in a call is observed. When the child ends, the caller takes the edge
named for that end, folding what it returned. Before this, composing
workflows meant importing another's states and record fields in TypeScript,
and nothing showed or checked where one ended and the other began.

Everything that can be wrong with a call is refused at boot, naming the call
path: a call state with no binding, an end with no edge, an `output` for an
end that returns nothing, an `input` for a callee that takes none, a need no
mounted port satisfies (`oncall → REVIEW → FIX: needs code-host`), a cycle at
any depth, and a callee claiming a write its caller does not. `port()` takes
`requires`, for a method a port only offers optionally.

**The pull request is opened by one shipped workflow.** `note-to-plan` and the
errand both opened a pull request and waited for it, written twice. Both now
call `@amykit/workflow-pull-request`, which opens or finds one through the
`CodeHost` port and returns `OPENED` with its number and link, or `REFUSED`
with the host's reason. A refused pull request hands the work back with that
reason, where before it failed every look until the machine gave up. The
port gains `CodeHostRefusal`, and the GitHub adapter throws it for a 422, so
an answer is told apart from an outage, which is still retried.

**A callee can be copied in and owned.** `amy workflow add <spec> --into
<name>` copies a workflow, with every file its entry imports, into one of your
own, installing what it depends on; a dependency that cannot be resolved
refuses the copy before anything is written. `amy workflow export --expand`
draws each call as the workflow it calls, and `amy status` shows where work
stands through its calls, with a callee's escalation as the root's attention.

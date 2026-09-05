---
name: amy-workflow
description: >-
  Design a new amy workflow, or change one that exists, by being interrogated
  one question at a time until the shape is settled — then write it as its own
  package. Use when somebody describes a routine they want amy to drive (an
  on-call week, a review rotation, a private process at work), asks to add or
  edit a workflow, or when an existing workflow keeps doing the wrong thing at
  one step. Covers the interrogation, the two halves every workflow has, the
  seven things it declares, and the walkthrough test that is the only proof.
version: 2.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [amy, workflow, plugin, design, state-machine]
    related_skills: [amy, amy-develop, amy-show-me]
---

# Designing a workflow

A workflow is a package. It says what happens next and how each step is done,
and amy drives it without knowing what any of it means. Nothing in amy's own
code names a workflow, so a new one is **written, installed and configured** —
never merged into amy unless it belongs to everybody.

That matters most for the ones that cannot be shared. A process that names
your employer's tooling, a private feedback step, an on-call rota: those live
in a package of yours, versioned wherever you like.

## How this skill runs

**One question at a time.** Not a list, not a form. Each question carries the
answer I would give and why, so the cheap move is agreeing and the expensive
move is the one you think about.

**Each round redraws the workflow.** After every answer, show the machine as
it now stands, as a diff against the round before — so the cost of an answer
is visible at the moment it is given, not at the end.

**Stop when nothing is left assumed**, not after N questions. If a question
cannot be answered without seeing the thing run, say so and stop asking it:
that one needs a prototype, not a decision.

Write no files until the shape is settled and the person says go.

### The shape of a round

> **Q3 — the ceiling.** When the check comes back red, does the agent get
> another go, or does it come to you?
>
> Two other workflows here bound this with `attempts` and give up after a
> handful, because an agent that could not fix it in three tries usually
> cannot fix it in ten and the tries cost money.
>
> ➡️ **I'd say: three tries, then announce and wait.** You are on call when
> this runs, so the failure mode to avoid is a machine burning quota at 3am
> on something it will not solve.

```diff
 paged ──► triaged ──► acting ──► resolved
             │
+            ├──(3 failed tries)──► stuck
```

Then the next question, which is now *"what does `stuck` do — comment on the
incident, or page a human?"* — because the answer created it.

## What to ask about, in this order

Later questions only make sense once the earlier ones are settled, so this is
the frontier, not a checklist.

1. **What starts a piece of work?** Something in a tracker, a file dropped in
   a directory, a schedule, a webhook already writing to disk. This is
   `found()`, and it decides whether the workflow needs a tracker at all.
2. **What is the last state, and how do you know it happened?** Working
   backwards from *done* stops a machine that never finishes.
3. **What are the steps between?** Name them as states. Five is usually
   plenty; a workflow with twelve is two workflows.
4. **Which steps wait on somebody else?** A wait is not a failure — it is a
   state that makes no move until the world moves. These become
   `waitingStates`, and they are why the loop can be cheap.
5. **What does each step actually do?** One handler per action. "An agent does
   it" is one call to the `agent` port and four lines.
6. **What happens when a step fails, and how many times?** The ceiling.
7. **Who gets told, and when?** Silence is a real answer for a workflow that
   only runs on your own machine.

## Editing one that exists

Same interrogation, different first move: **read the workflow first and show
it back**, then ask what is wrong with it. The questions are about the delta.

```sh
amy workflow list                          # what is configured, and what it holds
amy --workflow oncall status               # where its work stands right now
```

Then find its package — `workflows.<name>.workflow` in `.amy/config.yaml` —
and read `plan()` before asking anything. Two rules for an edit:

- **A state that has records in it cannot simply disappear.** Ask what happens
  to the work sitting in it: migrate it to the nearest state, or drain it
  first. A record whose `state` no longer exists is a record the machine will
  refuse to load.
- **Renaming a state is deleting one and adding another.** Same question.

Re-run the walkthrough test after every edit. It is the test that catches the
state you forgot to connect.

## The two halves

**`plan()` is pure.** It takes the record, a snapshot of the world and the
policy, and returns what should happen. No I/O, no clock, no randomness —
that is what lets a whole lifecycle be driven in a test in milliseconds.

```ts
plan(record, observation, policy): Plan
```

A `Plan` is one of four: `act` (do these, stay here, look again straight
away), `advance` (move to that state, doing these on the way), `wait`
(nothing until the world moves), `settled` (terminal, queue nothing).

**The runtime is everything impure.** What the world looks like before
deciding, what each action does, and how what the actions produced folds back
into the record.

The engine folds the state, the attempt count and the history through
`applyPlan`. Your `apply()` folds the rest — it cannot fold what it does not
understand, which is why it is yours.

## What a workflow declares

```js
const workflow = {
  name: "oncall",
  states: ["paged", "acknowledged"],
  waitingStates: [],
  initialState: "paged",
  terminalStates: ["acknowledged"],
  usesActions: [],      // action names the plan may emit
  usesObservers: [],    // observation slices it reads
  plan: (record, observation, policy) => ({ ... }),
};

export const plugin = {
  name: "@acme/workflow-oncall",
  version: "1.0.0",
  register(registry, ctx) {
    registry.workflow(workflow);
    registry.contribute("workflow-runtime", "oncall", runtime(ctx));
  },
};
```

`usesActions` is data so the mount can be refused when an action has no port
behind it — at boot, by name, rather than at the first tick that needs it.

The runtime contributes to `workflow-runtime` under the workflow's own name.
A workflow that registers itself and contributes no runtime mounts and then
refuses: *"contributed no runtime, so nothing here knows how to run its
actions"*. That message is the one you will see if you forget this line.

There is a working example of the whole shape, in about forty lines, at
`.software-factory/evidence/installed-plugins/workflow-oncall/index.js`.

## Making it drivable

```yaml
# .amy/config.yaml
workflows:
  oncall:
    workflow: "@acme/workflow-oncall"
    plugins:                       # empty means the recommended set
      - "@acme/workflow-oncall"
      - "@amy/plugin-file-queue"
      - "@amy/plugin-file-store"
      - "@amy/plugin-serial-engine"
```

```sh
npm install -g @acme/workflow-oncall
amy --workflow oncall plugin list      # installed, and what this profile mounts
amy --workflow oncall tick             # one move, watched
amy --workflow oncall start            # the loop, in the background
```

A plugin named and not installed is refused at boot with the list of what is
installed, so a typo is one line to find.

## The test that is the point

One walkthrough test driving the whole lifecycle against a fake world,
asserting the states in order. Every workflow in this repository has one, and
it is the test that finds the bugs:

- the lifecycle walks in the order it claims
- one look makes at most one move
- it settles instead of spinning — drive it past the end, assert nothing moves
- a waiting state makes no move until the world does

Unit-test `plan()` directly for the branches: it is pure, so a table of
`(record, observation) -> Plan` is the cheapest test you will write.

## What not to do

- **Do not put I/O in `plan()`.** The moment it awaits anything, the lifecycle
  stops being testable in milliseconds.
- **Do not add a state for a failure that is a retry.** `attempts` is on the
  record and bounds every loop already.
- **Do not reach for a tracker, a code host or a shell from a handler.** Ask
  the port. A workflow that shells out is one that runs on one machine.
- **Do not fork an existing workflow to change two states.** Write the one you
  mean. They cost a file each, and a fork is a second thing to keep green.
- **Do not ask twenty questions when the cost of being wrong is one edit.**
  A workflow is cheap to change; a database schema is not. Grill in
  proportion.

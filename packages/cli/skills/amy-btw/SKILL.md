---
name: amy-btw
description: >-
  Capture something said in passing as work amy will actually do — "btw the
  deps in the api are stale", "also check whether that monitor is still
  firing" — without opening a ticket and without leaving what you are doing.
  Use the moment somebody says "btw", "also", "while you're there", "remind
  me to", or when you notice something mid-task that is not the task. Writes
  a self-contained task onto amy's queue.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [amy, task, capture, queue, errand]
    related_skills: [amy, amy-status]
---

# Something said in passing

```sh
amy btw "bump the stale deps in the api package" --repo acme/widgets
```

That writes a task and puts it on the errand queue. amy picks it up, works in
a branch of that repository, and either opens a pull request or comes back
with an answer. It never becomes a ticket and nothing resolves it against a
tracker — the whole point is that capturing costs one sentence.

## Your job is the sentence

The command is trivial. What is not trivial is that **whoever picks this up
has none of this conversation.** An agent, hours later, in a fresh checkout,
with the task text and nothing else.

So do not pass through what was said. Pass through what was *meant*, made
self-contained:

> **Said:** "btw this is stale"
>
> **Write:** "The dependencies in `packages/api` are several minor versions
> behind — `fastify`, `pino` and `zod` at least. Raise them to the latest
> minor, keep majors where they are, and make sure the test suite passes."

Three things it must carry, because the conversation will not:

1. **Where.** The repository, and the directory or file if you know it. You
   are in the checkout right now and the task is not.
2. **What "done" is.** "Bump the deps" is ambiguous about majors. One clause
   settles it.
3. **Why, when the why is not obvious.** It is what lets an agent do the
   right thing when the letter of the task turns out to be wrong.

Keep it to a few sentences. If it needs three paragraphs it is not an errand,
and the next section is about that.

## When not to use it

**A change that needs review, discussion or a decision is a ticket.** Say so.
An errand goes from a sentence to a pull request with nobody in the middle,
which is right for a dependency bump and wrong for anything somebody would
have opinions about.

**Friction amy itself hit is a note, not a task** — `amy note`, which becomes
a plan in the repository it is about. The difference is whose problem it is:
a task is work in your repositories, a note is something that got in amy's
way.

**Something with a deadline, an owner or a conversation attached is a
ticket.** Open one. This has no owner and no date, by design.

## Before you run it

Read the repository name off where you are, do not ask for it:

```sh
git -C . remote get-url origin        # the repo the person means, usually
amy workflow list                     # is there an errand profile at all
amy --workflow errand status          # how many are already in flight
```

`--repo` when it is not the obvious one, `--source` when somebody other than
the person typing asked for it. Then read the task back in one line so a
wrong reading costs a correction rather than a pull request.

## After

```sh
amy --workflow errand status          # where it stands
amy --workflow errand tick            # move it now, watched
```

If the loop is running (`amy status` says), it will be picked up on its own —
say so rather than leaving somebody watching.

**The ceiling is real.** Past a few errands in flight, amy holds the rest and
says so once. That is deliberate: capturing costs nothing, and the failure
that follows from that is thirty open pull requests nobody asked to review. If
it is holding, the answer is to land one, not to raise the number.

## What comes back

- **It changed something** → a pull request, and you are told the number.
- **It was a question** → an answer, and no pull request. `"check whether the
  monitor is still firing"` is a finished errand that touched no file.
- **It could not be done** → it is handed back with the last thing the agent
  said, after a couple of tries. It does not sit there quietly.

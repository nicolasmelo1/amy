# Grooming reads the sections its workflow declares

[A project is three phases](../docs/design/a-project-is-three-phases.md) gave a
project a `brief/` phase, and the brief port keeps whatever sections the
workflow declared, in its order (`BriefRecord.sections` in
`packages/core/src/ports/Brief.ts`). `amy brief <id>` shows one. Two things a
person needs to *write* one are missing.

**Nothing checks a brief.** Whether a brief is ready — every section the
workflow requires is there, every criterion names what proves it — is a
judgement each workflow makes in its own code, and there is no command that
asks it. A person grooming has to know where that code lives.

**There is no grooming skill.** The only one that exists was written inside a
private workflow, against that workflow's parser and its tracker, and cannot be
handed to a person grooming something else. The skills amy ships
(`packages/cli/skills/`) cover running amy, not deciding what it builds.

## What changes

**`amy brief check <id>`.** A workflow with a `brief/` phase exports one
function, `check(record) → refusal[]`, each refusal naming the section and the
rule. The command runs it against the stored brief and exits non-zero while
anything is refused. A workflow that declares no check is told so by
`amy doctor`, not by a check that always passes.

**`amy-groom`, shipped.** A skill in `packages/cli/skills/amy-groom/` that:

- reads the sections the selected workflow declares, and the code at the base
  branch through `BaseSource`, before asking anything;
- asks one question at a time, in section order, and writes the answer into the
  brief through the brief port — never into a tracker or a code host;
- runs `amy brief check` after each section and does not move on while that
  section is refused;
- stops when the check is green, and says so.

It is a skill like the others, so it installs into any agent that reads
skills — including one the operator talks to from a phone.

## Acceptance criteria

- [ ] `amy brief check` exits zero on a brief the workflow's check accepts and
      non-zero naming the section and rule on one it refuses
      (proof: deferred:test:packages/cli/tests/brief-check.test.ts)
- [ ] A workflow with a `brief/` phase and no exported check is reported by
      `amy doctor` (proof: deferred:test:packages/cli/tests/doctor.test.ts)
- [ ] `amy-groom` names the sections it will ask about from the workflow's
      declaration, not from a list of its own
      (proof: unspecified:a skill's behaviour is checked by a transcript run, and the harness for that is not designed)
- [ ] A brief groomed through the skill is stored through the brief port and
      `amy brief check` is green on it
      (proof: deferred:scenario through the installed executable, the skill driven by a recorded transcript)
- [ ] The shipped skill names no tracker, no team and no private workflow
      (proof: deferred:test reading the skill's text)

**Exit condition:** a workflow declaring four sections and a check gets a brief
groomed by the shipped `amy-groom` from an agent that is not the one running
amy, stored through the brief port, and `amy brief check` green on it.

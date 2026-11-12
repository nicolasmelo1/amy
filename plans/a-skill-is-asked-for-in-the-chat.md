---
base: e7bbfc195435fdd386010fe44df871589e5807db
sources:
  - { id: S1, kind: friction, said: "2026-11-11: grooming a feature means opening a terminal for /amy-groom; it should start from Slack, `/amy-groom let's groom X`, and go on in the thread" }
  - { id: S2, kind: code, ref: "packages/cli/src/harnesses.ts", symbol: "harnesses", said: "amy skills writes amy's skills only into a harness's own directory (~/.claude, ~/.codex, ~/.hermes skills); amy keeps no copy of its own" }
  - { id: S3, kind: code, ref: "plugins/agent-relay/src/skills.ts", symbol: "DEFAULT_SKILL_ROOT", said: "a step's skills are looked up under ~/.claude/skills unless skillRoots says otherwise, so what a step may use depends on the operator's harness setup" }
  - { id: S4, kind: code, ref: "plugins/agent-relay/src/skills.ts", symbol: "parseSkills", said: "the skills setting is a ladder per step, checked at boot against what is installed, but only core actions reaching the agent are steps; `chat` is not one" }
  - { id: S5, kind: code, ref: "packages/core/src/chat/desk.ts", symbol: "leadingCommand", said: "a chat message may start with /new, /harness or /action; anything else is a read-only question, and a chat turn asks its harness with no skill" }
  - { id: S6, kind: code, ref: "packages/core/src/ports/Harness.ts", symbol: "AskContext", said: "AskContext.skill lends a skill by name and directory; the claude harness lends it to an isolated run with --add-dir" }
  - { id: S7, kind: code, ref: "packages/cli/src/chat-action.ts", said: "the /action list already holds brief sections, show, write and check, every command amy-groom runs" }
  - { id: S8, kind: reference, ref: "https://community.atlassian.com/forums/Jira-Service-Management/Using-the-updated-slash-commands-to-raise-a-request-in-a-request/qaq-p/2514844", said: "Slack takes a message starting with / as one of its own commands; a leading space sends it as text" }
  - { id: S13, kind: code, ref: "packages/core/src/chat/commands.ts", symbol: "refusedCommands", said: "a chat command declared with no arguments refuses any, so `brief sections --json` is refused; tokenize refuses a heredoc, so a multiline section cannot be written from the chat" }
  - { id: S14, kind: code, ref: "packages/core/src/chat/commands.ts", symbol: "commandsIn", said: "a fenced block tagged with a file name is already carried beside the commands, the way config apply takes its config.yaml" }
  - { id: S15, kind: decision, said: "a section's body reaches brief write from a named fenced block (`--from answer.md`), never a shell; amy-groom says so for the chat. Proposed 2026-11-11, from review on #205" }
  - { id: S9, kind: decision, said: "amy installs every skill it ships into ~/.amy/skills, its own root, on install and on every update; a harness directory stays an extra the person chooses. Decided 2026-11-11" }
  - { id: S10, kind: decision, said: "which skills the chat may run is the skills ladder already in the config, under the step `chat`; nothing else names them. Decided 2026-11-11" }
  - { id: S11, kind: decision, said: "a turn that starts with a skill is an /action turn: the commands its answer names run, under the same list. Decided 2026-11-11" }
  - { id: S12, kind: decision, said: "a thread started with a skill keeps it: every later message there is answered with the skill lent and acting, the way grooming asks one question at a time. Decided 2026-11-11" }
  - { id: S16, kind: decision, said: "a harness's installed skills load through a config in .amy/config.yaml or agent-relay: a symlink in amy's skills folder, nothing copied; false removes it, true restores it; active only during run/tick. Decided 2026-11-12, on #216" }
  - { id: S17, kind: decision, said: "the ~/.claude/skills fallback goes: a harness's skills reach amy only through that config; it is a map per harness (`harnessSkills: { claude: true }`), one link per skill, amy's own copy winning. Decided 2026-11-12" }
  - { id: S18, kind: decision, said: "the harness names are not written in stone: they are the installed harness plugins' names, and agent-relay keeps no list of them. Decided 2026-11-12" }
touches:
  - packages/cli/src/harnesses.ts
  - packages/cli/src/skills-record.ts
  - packages/cli/src/index.ts
  - packages/cli/src/config.ts
  - packages/cli/tests/harnesses.test.ts
  - plugins/agent-relay/src/skills.ts
  - plugins/agent-relay/src/config.ts
  - plugins/agent-relay/src/plugin.ts
  - plugins/agent-relay/tests/skills.test.ts
  - packages/core/src/chat/desk.ts
  - packages/core/src/chat/commands.ts
  - packages/core/tests/chat/commands.test.ts
  - packages/cli/src/chat-action.ts
  - packages/cli/skills/amy-groom/SKILL.md
  - packages/core/src/chat/transcript.ts
  - packages/core/tests/chat/desk.test.ts
  - docs/start/installation.md
  - docs/concepts/harnesses.md
  - plugins/agent-relay/src/index.ts
  - plugins/agent-relay/README.md
  - packages/cli/tests/chat-action.test.ts
  - packages/cli/tests/update.test.ts
  - docs/reference/cli.md
  - docs/reference/plugins.md
  - registry/cli.json
  - registry/core.json
  - registry/plugin-agent-relay.json
  - packages/core/src/ports/Harness.ts
  - plugins/claude/src/ClaudeHarness.ts
  - plugins/claude/tests/ClaudeHarness.test.ts
  - packages/cli/tests/config.test.ts
  - registry/plugin-claude.json
  - packages/cli/src/assemble.ts
  - packages/cli/src/slices.ts
  - plugins/agent-relay/tests/plugin.test.ts
  - plugins/codex/src/CodexHarness.ts
  - plugins/codex/tests/CodexHarness.test.ts
  - registry/plugin-codex.json
  - .software-factory/evidence/amy-answers-in-the-chat/drive.ts
  - docs/start/configuration.md
  - docs/reference/configuration.md
criteria:
  - { id: A1, statement: "amy install and amy update write every shipped skill into ~/.amy/skills, each a directory with its SKILL.md, whether or not a harness directory was chosen", proof: "deferred:test:packages/cli/tests/harnesses.test.ts", sources: [S2, S9] }
  - { id: A2, statement: "a step's skills are looked up in ~/.amy/skills first, then the configured roots, and never in ~/.claude/skills on its own", proof: "deferred:test:plugins/agent-relay/tests/skills.test.ts", sources: [S3, S9, S17] }
  - { id: A3, statement: "`skills: { chat: [amy-groom] }` mounts; a chat skill that is not installed is refused at boot, naming it and what is installed", proof: "deferred:test:plugins/agent-relay/tests/skills.test.ts", sources: [S4, S10] }
  - { id: A4, statement: "a message starting with /amy-groom, after any leading space or a bot's name, is answered with amy-groom lent to the harness, as an /action turn", proof: "deferred:test:packages/core/tests/chat/desk.test.ts", sources: [S1, S5, S6, S7, S8, S11] }
  - { id: A5, statement: "a later message in that thread, with no prefix, is answered with the same skill lent and acting; /new ends it", proof: "deferred:test:packages/core/tests/chat/desk.test.ts", sources: [S12] }
  - { id: A6, statement: "a /skill the chat ladder does not name is answered with the skills it does name, and nothing runs", proof: "deferred:test:packages/core/tests/chat/desk.test.ts", sources: [S10] }
  - { id: A7, statement: "the harness still runs read-only in a skill turn: what acts is the amy commands its answer names, from the /action list", proof: "deferred:test:packages/core/tests/chat/desk.test.ts", sources: [S7, S11] }
  - { id: A8, statement: "brief sections and brief check take --json from the chat, and brief write takes --explains and --from <block>, a fenced block in the same answer", proof: "deferred:test:packages/core/tests/chat/commands.test.ts", sources: [S7, S13, S14, S15] }
  - { id: A9, statement: "a skill turn writes a multiline section through --from and the next brief check reads it, on the fakes", proof: "deferred:test:packages/core/tests/chat/desk.test.ts", sources: [S1, S13, S15] }
  - { id: A10, statement: "`harnessSkills` is read top-level or under the relay's settings, the relay winning; its keys are the mounted harness plugins' names", proof: "deferred:test:plugins/agent-relay/tests/plugin.test.ts", sources: [S16, S18] }
  - { id: A11, statement: "a name no harness plugin mounted, a value not true or false, or true for a harness reporting no skillsDirectory is refused at boot", proof: "deferred:test:plugins/agent-relay/tests/plugin.test.ts", sources: [S17, S18] }
  - { id: A12, statement: "at run, tick and each loop pass, each skill of a harness set to true is linked into ~/.amy/skills, one symlink per skill, amy's own copy winning", proof: "deferred:test:packages/cli/tests/harnesses.test.ts", sources: [S16, S17] }
  - { id: A13, statement: "false, left out, or the harness's plugin no longer mounted removes only the links amy made", proof: "deferred:test:packages/cli/tests/harnesses.test.ts", sources: [S16] }
crosses:
  - { mechanism: install-and-update, answer: works, proof: "deferred:test:packages/cli/tests/harnesses.test.ts" }
  - { mechanism: config, answer: works, proof: "deferred:test:plugins/agent-relay/tests/skills.test.ts" }
  - { mechanism: agent-replies, answer: works, proof: "deferred:test:packages/core/tests/chat/desk.test.ts" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:test:plugins/agent-relay/tests/plugin.test.ts" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "the harness port gains an optional fact a harness reports about itself; nothing is written to a tracker or a host" }
guarantee:
  - { holds: "a skill the chat runs is one amy installed and the config names for the chat", not_against: "a person editing a SKILL.md under ~/.amy/skills by hand until the next update" }
  - { holds: "a skill turn acts only through the /action list", not_against: "a skill whose instructions ask for a command off the list: it is refused, not run" }
  - { holds: "a harness's skill reaches amy only as a link the config asked for, and amy never writes through one", not_against: "a person editing the harness's own SKILL.md, which the link shows as it is" }
failures:
  - { step: chat, when: "the skill named is on the ladder but its directory is gone", goes_to: "an answer naming the skill and `amy skills`, and nothing runs" }
  - { step: chat, when: "--from names a block the answer does not carry", goes_to: "the whole block refused, naming the missing block, and nothing runs" }
  - { step: install, when: "~/.amy/skills cannot be written", goes_to: "a failed install naming the directory" }
  - { step: run, when: "a harness's skills cannot be linked", goes_to: "a line naming harnessSkills, and the run goes on; a skill it leaves missing is refused where it is asked for" }
cut:
  - "a skill shipped by a plugin rather than by amy: the plugin's own plan"
  - "a skill turn that writes files itself: the harness stays read-only"
exit: "from Slack, `/amy-groom` on a ticket grooms its brief in the thread until amy brief check is green, with nothing typed in a terminal"
---
# A skill is asked for in the chat

Grooming needs a terminal today: amy's skills live only in a harness's own
directory, and the chat knows three commands. This plan gives amy its own
skill root, lets the chat's ladder name the skills a message may start with,
and runs such a thread as /action. A harness's own skills reach amy only as
links `harnessSkills` asks for, by the harness plugin's name, for each run.

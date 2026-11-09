---
sources:
  - { id: S1, kind: friction, said: "2026-11-09: the proving phase drives agent-browser, agent-desktop and terminal-use, but installing a driver plugin does not check that its tool is there, nor try to install it; the person adds the plugin and it does not work" }
  - { id: S2, kind: code, ref: "plugins/agent-browser/src/plugin.ts", said: "the browser, desktop and terminal plugins only learn their binary is missing when a command fails mid-proof; none registers a check or a setup" }
  - { id: S3, kind: code, ref: "packages/core/src/commands.ts", symbol: "PluginSetup", said: "a plugin already brings setups, run by amy init and amy add, that may run commands and must leave alone what an earlier run made; and checks, run by amy doctor, that say how a later drift is told" }
  - { id: S4, kind: reference, ref: "https://agent-browser.dev/installation", said: "agent-browser installs with npm install -g agent-browser (or brew, or cargo); agent-browser install downloads Chrome for Testing; agent-browser doctor --offline --quick --json checks the machine and exits 1 when a check fails" }
  - { id: S5, kind: reference, ref: "https://agent-browser.dev/desktop", said: "agent-desktop installs with npm install -g agent-desktop; agent-desktop status reports the platform, the permissions and the surfaces; on macOS the app running it needs the Accessibility permission, which no command can grant" }
  - { id: S6, kind: reference, ref: "https://github.com/flipbit03/terminal-use", said: "tu installs with cargo install terminal-use, or with a prebuilt binary through curl ... install.sh | sh; the page names no npm or brew package and no version command" }
  - { id: S7, kind: reference, ref: "docs/design/nothing-is-installed-by-default.md", said: "only what the person chooses is installed; choosing a driver plugin is choosing the tool it drives" }
  - { id: S8, kind: reference, ref: "plans/a-harness-answers-before-the-work.md", said: "the harness plugins ship a doctor check that pings what they were given; a driver plugin's check is the same move for a tool instead of a model" }
  - { id: S9, kind: code, ref: "plugins/prove/src/scenario.ts", said: "a scenario's steps reach a driver only through its operations, so the drivers a scenario needs are readable from the scenario before it runs" }
  - { id: S10, kind: decision, said: "a setup installs a missing tool only through a package manager already on the machine: npm for agent-browser and agent-desktop, cargo for terminal-use. It never pipes a script into a shell. Proposed 2026-11-09" }
  - { id: S11, kind: decision, said: "a proof whose scenario needs a driver whose check is red does not start: it asks a person in the work's thread, naming the driver and what the check said, instead of failing on the first step. Proposed 2026-11-09" }
  - { id: S12, kind: decision, said: "the drivers a proof checks are those its steps and its fixtures' checks and actions name; a scenario with an agent step checks every mounted driver, since the agent picks at runtime. Proposed 2026-11-09" }
  - { id: S13, kind: code, ref: "plugins/prove/src/plugin.ts", said: "the plugin observes, asks and resumes; decide.ts is pure and gets no health results, and a human answer resumes RUNNING, not a step before leasing" }
touches:
  - packages/agent-kit/src/tool.ts
  - packages/agent-kit/src/index.ts
  - packages/agent-kit/tests/tool.test.ts
  - plugins/agent-browser/src/plugin.ts
  - plugins/agent-browser/tests/tool.test.ts
  - plugins/agent-desktop/src/plugin.ts
  - plugins/agent-desktop/tests/tool.test.ts
  - plugins/terminal/src/plugin.ts
  - plugins/terminal/tests/tool.test.ts
  - plugins/prove/src/decide.ts
  - plugins/prove/src/plugin.ts
  - plugins/prove/src/fixtures.ts
  - plugins/prove/tests/drivers.test.ts
  - plugins/agent-browser/README.md
  - plugins/agent-desktop/README.md
  - plugins/terminal/README.md
  - docs/start/status-and-doctor.md
  - docs/build/prove-a-phase.md
criteria:
  - { id: A1, statement: "with agent-browser absent, amy doctor fails under the agent-browser plugin's name, saying the binary is missing and the command that installs it; present and healthy, the check is green and names the version its own doctor reported", proof: "deferred:test:plugins/agent-browser/tests/tool.test.ts", sources: [S1, S2, S3, S4, S8] }
  - { id: A2, statement: "amy add of the browser plugin on a machine with npm and no agent-browser runs npm install -g agent-browser then agent-browser install, and a second amy add runs neither", proof: "deferred:test:plugins/agent-browser/tests/tool.test.ts", sources: [S3, S4, S7, S10] }
  - { id: A3, statement: "agent-desktop installed but missing the Accessibility permission fails its check naming the permission and where it is granted; the setup does not try to grant it", proof: "deferred:test:plugins/agent-desktop/tests/tool.test.ts", sources: [S5] }
  - { id: A4, statement: "with no tu and no cargo, the terminal plugin's setup installs nothing, prints the cargo and the binary install commands, and its check stays red", proof: "deferred:test:plugins/terminal/tests/tool.test.ts", sources: [S6, S10] }
  - { id: A5, statement: "a scenario with a browser step and a red browser check is asked of a person before its first step, naming the driver and the check's words; no lease is taken", proof: "deferred:test:plugins/prove/tests/drivers.test.ts", sources: [S9, S11, S12] }
  - { id: A6, statement: "a fixture whose action names a red driver, and an agent-step scenario with any red mounted driver, are both asked before leasing; after the person answers, the checks run again before a lease is taken", proof: "deferred:test:plugins/prove/tests/drivers.test.ts", sources: [S12, S13] }
crosses:
  - { mechanism: agent-replies, answer: n/a, why: "agent-kit gains a helper that runs a tool's own health command and reads its exit; no agent reply is read" }
  - { mechanism: attempts-and-waits, answer: n/a, why: "a check or setup is no agent run, so no attempt is charged; the proof's ask before its first step is the human step it already has (S11)" }
guarantee:
  - { holds: "a machine whose driver tool is missing or unusable says so at amy doctor and at amy add, naming the tool and how to fix it", not_against: "a tool that passes its own health command and still fails one operation later" }
  - { holds: "nothing is installed that the person did not choose, and nothing is installed by piping a downloaded script into a shell", not_against: "what npm or cargo install as the tool's own dependencies" }
  - { holds: "a proof never starts on a driver whose check is red", not_against: "a driver that breaks after the proof started, which fails the step as it does today" }
failures:
  - { step: setup, when: "the package manager's install fails", goes_to: "a red setup naming the command and its first error line; the check stays red" }
  - { step: proof, when: "a needed driver's check is red", goes_to: "a question in the work's thread, before any lease is taken" }
cut:
  - "granting macOS Accessibility or any OS permission: refused, the OS asks the person; the check only says which and where"
  - "curl ... | sh for terminal-use: refused, printed for the person instead (S10)"
  - "pinning or upgrading a tool's version: later, once a driver needs a minimum the check can read"
exit: "on a machine without agent-browser, amy add @amykit/plugin-agent-browser installs it and its browser, amy doctor is green naming its version, and a proof with a browser step on a machine where it is missing asks a person before it starts"
---
# A tool is there before the proof

A driver plugin is only as good as the program it drives. Adding the browser,
desktop or terminal plugin should check that agent-browser, agent-desktop or
terminal-use is installed and usable, install it when the machine already has
the right package manager, and say exactly what is missing when it cannot. A
proof checks the same thing before it starts, so it never fails halfway for a
reason it could have known up front.

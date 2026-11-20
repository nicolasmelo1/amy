---
base: 4fb25dd78e0175bea74eedee39d92ca5eaf976fd
sources:
  - { id: S1, kind: code, ref: "packages/cli/src/auto-update.ts", symbol: "recoverDaemonUpdateClaim", said: "it reads the owner of a stale .claimed, then renames the path back to due without checking it is still that owner's; the take, update, finish or retry sequence is written four times" }
  - { id: S2, kind: reference, said: "probe 2026-11-15 at f804048e: two starters recovering one stale .claimed, the second acting on the pid it had read, both took the update; eight live takers on a fresh claim, one won every round" }
  - { id: S3, kind: code, ref: "plugins/file-worktree/src/manager.ts", said: "writeMeta and touch write a tree's meta in place; readMeta takes a torn read as no meta and describe dates the tree now" }
  - { id: S4, kind: reference, said: "probe 2026-11-15: a touch racing a readMeta in another process read no meta in 2943 of 20000 reads" }
  - { id: S5, kind: code, ref: "plugins/slack/src/SlackConversation.ts", said: "post, say and the ask paths send their text in one chat.postMessage, unsplit and with no warning read; Telegram splits at 4096" }
  - { id: S6, kind: reference, ref: "https://docs.slack.dev/reference/methods/chat.postMessage", said: "Slack asks text be kept to 4,000 characters and truncates past 40,000, answering ok with a message_truncated warning" }
  - { id: S7, kind: code, ref: "packages/cli/src/supervisor/windows.ts", said: "the Windows supervisor takes AMY_HOME raw, where home.ts trims and resolves it" }
  - { id: S8, kind: reference, said: "probe 2026-11-15: AMY_HOME with surrounding spaces put amy stop's marker under '  ./rel  /supervisor', where the launcher never looks" }
  - { id: S9, kind: code, ref: "packages/cli/src/doctor.ts", said: "the doctor reads the file-worktree slice on its own and turns an empty workspaceRoot into '.'; slices.ts passes it through, and the manager then clones from <owner>/<repo>" }
  - { id: S10, kind: reference, said: "probe 2026-11-15: with workspaceRoot empty the doctor checked ./widgets, the port answered widgets and the manager cloned acme/widgets; with ~ the three agreed" }
  - { id: S11, kind: code, ref: "packages/core/src/operator.ts", symbol: "sayToOperator", said: "it opens the thread by the workId it is given, where the fan-out notifier opens it by unitOf; the one caller today passes unitOf" }
  - { id: S12, kind: decision, said: "every fix is proven by a property whose falsifier, written in the property file, plants the defect the probe measured. Decided 2026-11-15" }
  - { id: S13, kind: decision, said: "the daemon's update claim is taken through core's takeLock, whose tombstone re-check is already proven, and its one sequence is written once. Proposed 2026-11-15" }
touches:
  - packages/cli/src/auto-update.ts
  - packages/cli/src/index.ts
  - packages/cli/tests/daemon-update-claim.property.test.ts
  - packages/cli/tests/auto-update.test.ts
  - packages/cli/tests/daemon-update-take.test.ts
  - packages/cli/tests/doctor-workspace-root.test.ts
  - plugins/file-worktree/tests/workspace-root.test.ts
  - plugins/slack/tests/long-text-paths.test.ts
  - scripts/tests/every-claim-and-path-agrees-gate.test.ts
  - plugins/file-worktree/src/manager.ts
  - plugins/file-worktree/tests/meta.property.test.ts
  - plugins/slack/src/SlackConversation.ts
  - plugins/slack/tests/long-text.property.test.ts
  - packages/cli/src/supervisor/windows.ts
  - packages/cli/tests/supervisor-home.property.test.ts
  - packages/cli/src/doctor.ts
  - packages/cli/src/slices.ts
  - plugins/file-worktree/src/config.ts
  - packages/cli/tests/worktree-slice.property.test.ts
  - packages/core/src/operator.ts
  - packages/core/src/git.ts
  - packages/core/tests/operator.property.test.ts
  - packages/core/tests/process-lock.property.test.ts
  - .software-factory/policy.yaml
  - .software-factory/evidence/every-claim-and-path-agrees-scenario.sh
  - .software-factory/evidence/every-claim-and-path-agrees/drive.ts
  - registry/cli.json
  - registry/core.json
  - registry/plugin-file-worktree.json
  - registry/plugin-slack.json
  - docs/development/the-gate.md
  - CONTRIBUTING.md
  - scripts/duplication-baseline.json
criteria:
  - { id: A1, statement: "for any starters, deaths and stale claims, the daemon's update is taken by at most one at a time and runs once per due; take, update, finish or retry is one function", proof: "property:packages/cli/tests/daemon-update-claim.property.test.ts#recover_acts_on_a_stale_read", done: true, sources: [S1, S2, S12, S13] }
  - { id: A2, statement: "for any interleaving of a meta write and a read in another process, the read sees a whole meta, through core's atomic write, and the meta's frozen key leaves the ratchet", proof: "property:plugins/file-worktree/tests/meta.property.test.ts#meta_written_in_place", done: true, sources: [S3, S4, S12] }
  - { id: A3, statement: "for any text, Slack's posts each hold at most 4,000 characters, in order, and joined give the text back; a message_truncated warning is logged", proof: "property:plugins/slack/tests/long-text.property.test.ts#one_post_for_any_length", done: true, sources: [S5, S6, S12] }
  - { id: A4, statement: "for any AMY_HOME with any surrounding space, relative or absolute, the Windows supervisor's directory is amyHome's", proof: "property:packages/cli/tests/supervisor-home.property.test.ts#amy_home_taken_raw", done: true, sources: [S7, S8, S12] }
  - { id: A5, statement: "for any workspaceRoot and checkouts the schema accepts, the doctor checks the path the manager clones from, read by one parser; an empty workspaceRoot is refused at boot", proof: "property:packages/cli/tests/worktree-slice.property.test.ts#the_doctor_reads_its_own_slice", done: true, sources: [S9, S10, S12] }
  - { id: A6, statement: "for any record id, a child's included, sayToOperator and the fan-out notifier open the same one thread", proof: "property:packages/core/tests/operator.property.test.ts#a_raw_work_id", done: true, sources: [S11, S12] }
  - { id: A7, statement: "the built amy, in separate processes, recovers a stale update claim once from two starters (assertion:agree.a_stale_update_claim_is_recovered_once), and amy stop on Windows paths writes where the launcher reads (assertion:agree.amy_stop_writes_where_the_launcher_reads)", proof: "assertion:agree.a_stale_update_claim_is_recovered_once", done: true, sources: [S2, S8, S13] }
crosses:
  - { mechanism: install-and-update, answer: works, proof: "A1" }
  - { mechanism: process-locks, answer: works, proof: "A1" }
  - { mechanism: profiles-and-state, answer: works, proof: "A4" }
  - { mechanism: checkouts-and-leases, answer: works, proof: "A5" }
  - { mechanism: config, answer: works, proof: "A5" }
  - { mechanism: events-and-notifications, answer: works, proof: "A6" }
  - { mechanism: status, answer: works, proof: "A5" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "sayToOperator only chooses which thread it opens; nothing new is written to a tracker or a host" }
guarantee:
  - { holds: "each defect the 2026-11-15 probes measured here is reproduced by its falsifier and refused by its property", not_against: "an interleaving the generator never schedules; the scenario runs the built amy for the update claim" }
  - { holds: "one update runs at a time per install", not_against: "a person running npm install in the plugins root by hand" }
failures:
  - { step: boot, when: "workspaceRoot is empty", goes_to: "refused at boot naming file-worktree.workspaceRoot" }
  - { step: post, when: "Slack answers message_truncated", goes_to: "a log line naming the thread, and the post stands" }
cut:
  - "folding the four after-update call sites' callers into services: the-command-line-holds-no-rule"
exit: "the gate every-claim-and-path-agrees is green on the built amy and every property here fails with its falsifier planted"
---
# Every claim and every path agrees

The low findings left from 2026-11-15 are fixed here, each proved by a property
that fails when its falsifier plants the defect the probe measured: a stale
update claim is recovered once, a worktree's meta is replaced whole, Slack
splits long text at 4,000 characters, `AMY_HOME` is trimmed and resolved,
the doctor reads the manager's parser, and a child record speaks in its
unit's thread.

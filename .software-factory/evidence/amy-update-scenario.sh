#!/bin/sh
# The `amy-update` gate's scenario, as a repeatable run.
#
# Usage: amy-update-scenario.sh [report-path]
#
# Builds a scratch machine the way the guides tell people to: the CLI
# installed with `npm install -g`, a third-party workflow added at v1, one
# move driven, the workflow updated to v2, another move driven — and asserts
# the version that moved and the record that did not. A v3 that exports no
# `plugin` proves the rollback.
#
# Then the registry gains the next 0.x release
# of every `@amykit/*` package: one whose plugin refuses to import, rolled
# back whole, the global CLI with it; then a good one, which moves both roots
# to one version while a third-party 0.x range stays where its caret holds.
#
# No network, no credential, and no stand-in npm: a static registry on a
# loopback port serves tarballs this scenario packed, and real npm talks to
# it, so npm's own semver resolves every range and npm's own `-g` writes the
# global layout. The registry answering a range with whatever it holds would
# move the 0.x workflow and turn `a_third_party_range_is_honoured` red.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/amy-update-run.json"}
case "$report" in /*) ;; *) report="$PWD/$report" ;; esac

# By its physical path: on macOS the temporary directory sits behind the
# `/var` link, and npm writes the link to a path-added workflow relative to
# whichever of the two it was handed.
work=$(cd "$(mktemp -d)" && pwd -P)
registry_pid=""
cleanup() {
  if [ -n "$registry_pid" ]; then kill "$registry_pid" 2>/dev/null || true; fi
  if [ -z "${AMY_UPDATE_KEEP_WORK:-}" ]; then rm -rf "$work"; else echo "work kept at $work" >&2; fi
}
trap cleanup EXIT
mkdir -p "$work/home" "$work/global" "$work/fixtures"
tsx="$repo/node_modules/.bin/tsx"
machine="$here/amy-update/machine.ts"

# The installer packs this checkout's packages; those tarballs are what the
# registry publishes. It also installs the CLI into a root of its own, which
# is where the registry intent beside a bootstrap tarball is checked.
AMY_PACKAGES="@amykit/cli" \
  AMY_INSTALL_LIB="$work/lib" "$repo/scripts/install.sh" "$work/installer-bin" >/dev/null
if "$tsx" "$machine" registry-intent "$work/lib/package.json"; then
  install_registry_intent=0
else
  install_registry_intent=1
fi

# The releases: the one this checkout builds, and the next 0.x minor three
# times over — once with a plugin that refuses to import, once good, and
# once more for auto-update to reach.
current=$("$tsx" "$machine" version "$repo/packages/cli/package.json")
major=${current%%.*}
rest=${current#*.}
minor=${rest%%.*}
broken="$major.$((minor + 1)).0"
good="$major.$((minor + 1)).1"
later="$major.$((minor + 2)).0"
"$tsx" "$here/amy-update/release.ts" "$work/lib/packages" "$broken" "$work/release-broken" --broken @amykit/plugin-command-gate
"$tsx" "$here/amy-update/release.ts" "$work/lib/packages" "$good" "$work/release-good"
"$tsx" "$here/amy-update/release.ts" "$work/lib/packages" "$later" "$work/release-later"

# The workflows: three versions of one, and a young 0.x one published at
# 0.1.0 and 0.2.0 from the start. Each is one TypeScript source compiled the
# way npm ships it; the version it answers with is its manifest's.
fixture() {
  # fixture <source> <name> <version>
  "$tsx" "$here/lib/publish.ts" "$here/amy-update/$1" "$work/fixtures/$2-$3"
  printf '{"name":"%s","version":"%s","type":"module","main":"./index.js"}\n' "$2" "$3" > "$work/fixtures/$2-$3/package.json"
  (cd "$work/fixtures" && npm pack "./$2-$3" --pack-destination "$work/fixtures" >/dev/null 2>&1)
}
fixture workflow-oncall @acme/workflow-oncall 1.0.0
fixture workflow-oncall @acme/workflow-oncall 1.1.0
fixture workflow-without-plugin @acme/workflow-oncall 1.2.0
fixture workflow-oncall @acme/workflow-young 0.1.0
fixture workflow-oncall @acme/workflow-young 0.2.0

# amy keeps its state in one place per machine, so this run gets its own.
export HOME="$work/home"
cd "$work/home"

# The registry starts with this checkout's release, v1 of the workflow and
# both young versions. A version is published by putting its tarball where
# the registry reads, and withdrawn by taking it away.
state="$work/registry"
mkdir -p "$state/tarballs"
cp "$work/lib/packages/"amykit-*.tgz "$state/tarballs/"
publish() { cp "$@" "$state/tarballs/"; }
withdraw() { rm -f "$state/tarballs/$1"; }
publish "$work/fixtures/acme-workflow-oncall-1.0.0.tgz" "$work/fixtures/"acme-workflow-young-*.tgz
"$tsx" "$here/amy-update/registry.ts" "$state" "$repo/node_modules" \
  "@acme/workflow-oncall" "$HOME/.amy/lifecycle.log" > "$work/registry.log" 2>&1 &
registry_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  test -s "$state/url" && break
  sleep 1
done
test -s "$state/url" || { echo "the registry did not start" >&2; cat "$work/registry.log" >&2; exit 1; }
requests="$state/requests.log"

npm_config_registry=$(cat "$state/url")
export npm_config_registry
export npm_config_cache="$work/npm-cache"
# A published version must be seen on the next question, the way it is on a
# registry nobody has cached.
export npm_config_prefer_online=true
# npm reads configuration variables case-insensitively. Pin both spellings so a
# caller's configured global prefix cannot make this isolated machine install
# into the agent's own prefix instead.
export NPM_CONFIG_PREFIX="$work/global"
export npm_config_prefix="$work/global"

# The CLI, installed the way every guide says.
npm install --global --no-audit --no-fund --loglevel=error "@amykit/cli@$current" >/dev/null
amy="$work/global/bin/amy"
test -x "$amy" || { echo "npm install -g produced no command" >&2; exit 1; }

assertions=""
record() {
  status=failed
  if [ "$2" = "0" ]; then status=passed; fi
  assertions="$assertions{\"type\":\"$1\",\"status\":\"$status\"},"
  if [ "$status" = "failed" ]; then echo "FAILED $1" >&2; fi
}

says() {
  # says <name> <haystack> <needle>
  case "$2" in *"$3"*) record "$1" 0 ;; *) record "$1" 1 ;; esac
}

# The install records a registry intent even though the dependency itself is a
# local tarball, so self-update is not silently pinned forever.
record update.the_installed_cli_keeps_a_registry_intent "$install_registry_intent"

# 1. The machine two versions behind: the workflow at v1, one move driven.
# The first install is by path — the form `amy add` takes — and what it
# pins in the manifest is re-declared below as the range it came from, the
# way an operator publishes the version they want. Beside it, a first-party
# plugin and the young workflow, installed by npm from the registry with the
# carets npm saves: `^<current>` and `^0.1.0`.
added=$("$amy" add "$work/fixtures/@acme/workflow-oncall-1.0.0" 2>&1 || echo "")
says update.added_the_first_version "$added" "added @acme/workflow-oncall as the workflow \`oncall\`"
"$tsx" "$machine" pin-range
npm install --prefix "$HOME/.amy/plugins" --no-audit --no-fund --loglevel=error \
  "@amykit/plugin-command-gate@$current" "@acme/workflow-young@^0.1.0" >/dev/null
mkdir -p .amy/pages
echo "the disk filled up on node 3" > .amy/pages/PAGE-1.md
discovered=$("$amy" --workflow oncall discover 2>&1 || echo "")
says update.v1_finds_the_page "$discovered" "queued PAGE-1"
# The config names no schedule at all.  Make this invocation its twentieth,
# then read the registry's update mark before the workflow's own durable log.
mkdir -p .amy/workflows/oncall
printf '{"runs": 19}\n' > .amy/workflows/oncall/auto-update.json
: > "$requests"
rm -f .amy/lifecycle.log
first=$("$amy" --workflow oncall tick 2>&1 || echo "")
says update.v1_moves_the_page "$first" "the page was picked up at 1.0.0"
if [ "$(cat .amy/lifecycle.log)" = "update
workflow" ]; then
  record update.default_auto_update_runs_before_a_workflow 0
else
  record update.default_auto_update_runs_before_a_workflow 1
fi
record_before=$(cat .amy/oncall/records/PAGE-1.json)

# The rest of the schedule modes use the same installed command and workflow.
# A one-run after schedule proves ordering; a two-run schedule proves cadence
# persists in the profile state rather than in this process.
"$tsx" "$machine" auto-update-after
: > "$requests"
rm -f .amy/lifecycle.log
rm -f .amy/pages/PAGE-1.md
rm -rf .amy/oncall/queue
mkdir -p .amy/oncall/queue
echo "the disk filled up on node 5" > .amy/pages/PAGE-3.md
"$amy" --workflow oncall discover >/dev/null
"$amy" --workflow oncall tick >/dev/null 2>&1 || true
if [ "$(cat .amy/lifecycle.log 2>/dev/null || true)" = "workflow
update" ]; then
  record update.auto_update_can_run_after_a_workflow 0
else
  record update.auto_update_can_run_after_a_workflow 1
fi
"$tsx" "$machine" replace-in-config "everyRuns: 1" "everyRuns: 2"
printf '{"runs": 0}\n' > .amy/workflows/oncall/auto-update.json
: > "$requests"
"$amy" --workflow oncall run --max 1 >/dev/null 2>&1 || true
first_cadence=$(wc -l < "$requests" | tr -d ' ')
"$amy" --workflow oncall run --max 1 >/dev/null 2>&1 || true
second_cadence=$(wc -l < "$requests" | tr -d ' ')
if [ "$first_cadence" = "0" ] && [ "$second_cadence" -gt "0" ]; then record update.auto_update_respects_its_cadence 0; else record update.auto_update_respects_its_cadence 1; fi
"$tsx" "$machine" replace-in-config "enabled: true" "enabled: false"
: > "$requests"
"$amy" --workflow oncall run --max 1 >/dev/null 2>&1 || true
if [ ! -s "$requests" ]; then record update.auto_update_can_be_disabled 0; else record update.auto_update_can_be_disabled 1; fi
"$tsx" "$machine" replace-in-config "enabled: false" "enabled: true" "timing: after" "timing: during" "everyRuns: 2" "everyRuns: 0"
: > "$requests"
invalid=$("$amy" --workflow oncall tick 2>&1 || echo "")
if [ ! -s "$requests" ]; then says update.invalid_auto_update_settings_refuse_before_work "$invalid" '`autoUpdate.timing` must be `before` or `after`'; else record update.invalid_auto_update_settings_refuse_before_work 1; fi
"$tsx" "$machine" replace-in-config "timing: during" "timing: after" "everyRuns: 0" "everyRuns: 1"

# A started daemon has a detached reaper. It owns the marker after SIGTERM,
# and invokes update only after the loop exits; direct `daemon` documents that
# it is intentionally unscheduled rather than silently doing something else.
rm -f .amy/lifecycle.log
: > "$requests"
started=$("$amy" --workflow oncall start --every 1 2>&1 || echo "")
sleep 1
if case "$started" in *"started oncall: pid"*) false ;; *) true ;; esac || grep -q '^update$' .amy/lifecycle.log 2>/dev/null; then
  record update.a_daemon_updates_only_at_its_lifecycle_boundary 1
else
  "$amy" stop >/dev/null 2>&1 || true
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    grep -q '^update$' .amy/lifecycle.log 2>/dev/null && break
    sleep 1
  done
  if grep -q '^update$' .amy/lifecycle.log 2>/dev/null && ! test -f .amy/daemon.pid; then
    record update.a_daemon_updates_only_at_its_lifecycle_boundary 0
  else
    record update.a_daemon_updates_only_at_its_lifecycle_boundary 1
  fi
fi
# The detached reaper holds its due marker through the update. Starting the
# foreground daemon before that marker clears correctly refuses, so wait for
# the same durable boundary the command observes rather than racing it.
for attempt in $(seq 1 30); do
  if ! test -e .amy/workflows/oncall/auto-update-daemon &&
     ! test -e .amy/workflows/oncall/auto-update-daemon.claiming &&
     ! test -e .amy/workflows/oncall/auto-update-daemon.claimed; then
    break
  fi
  sleep 1
done
# A directly-driven daemon owns the same schedule and becomes visible while it
# runs, so update can never replace its files. After timing runs only after its
# foreground loop has returned and its record is gone.
rm -f .amy/lifecycle.log
: > "$requests"
"$amy" --workflow oncall daemon --every 1 > "$work/direct-daemon.log" 2>&1 &
direct=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  test -f .amy/daemon.pid && break
  sleep 1
done
if ! test -f .amy/daemon.pid; then
  cat "$work/direct-daemon.log" >&2 || true
  record update.direct_daemon_uses_the_configured_schedule 1
else
  kill -TERM "$direct"
  wait "$direct" || true
  if grep -q '^update$' .amy/lifecycle.log 2>/dev/null && ! test -f .amy/daemon.pid; then
    record update.direct_daemon_uses_the_configured_schedule 0
  else
    record update.direct_daemon_uses_the_configured_schedule 1
  fi
fi

# 2. `--check` names what would move, and moves nothing. The registry has
# gained 1.1.0, which the range the machine holds now points at.
publish "$work/fixtures/acme-workflow-oncall-1.1.0.tgz"
check=$("$amy" update --check 2>&1 || echo "")
says update.a_check_names_what_would_move "$check" "@acme/workflow-oncall  1.0.0 -> 1.1.0"
if grep -q '"version":"1.0.0"' .amy/plugins/node_modules/@acme/workflow-oncall/package.json; then
  record update.a_check_changes_nothing 0
else
  record update.a_check_changes_nothing 1
fi

# 3. The update moves the version and keeps records, queue and log.
updated=$("$amy" update 2>&1 || echo "")
says update.the_version_moved "$updated" "updated @acme/workflow-oncall"
says update.the_update_reports_the_move "$updated" "1.0.0 -> 1.1.0"
if grep -q '"version":"1.1.0"' .amy/plugins/node_modules/@acme/workflow-oncall/package.json; then
  record update.the_copy_on_disk_moved 0
else
  record update.the_copy_on_disk_moved 1
fi
if [ "$record_before" = "$(cat .amy/oncall/records/PAGE-1.json)" ]; then
  record update.the_state_survives_the_version 0
else
  record update.the_state_survives_the_version 1
fi
if grep -q '"@acme/workflow-oncall": "\^1' .amy/plugins/package.json; then
  record update.the_manifest_keeps_the_range 0
else
  record update.the_manifest_keeps_the_range 1
fi

# 4. The new version drives the work it finds, with its own reason. The
# page PAGE-1 came from is removed first — one tick moves one item, and the
# record is what the state assertion reads, not the file.
rm -f .amy/pages/PAGE-1.md
echo "the disk filled up on node 4" > .amy/pages/PAGE-2.md
discover_two=$("$amy" --workflow oncall discover 2>&1 || echo "")
run_two=$("$amy" --workflow oncall run 2>&1 || echo "")
says update.the_new_version_drives_the_work "$run_two" "the page was picked up at 1.1.0"

# 5. The machine boots after every move, or the move is not called done: an
# update that leaves a config which cannot boot has not worked. The registry
# has gained a 1.2.0 that exports no `plugin`, so the update that reaches it
# rolls back to the version that did mount.
publish "$work/fixtures/acme-workflow-oncall-1.2.0.tgz"
bad=$("$amy" update 2>&1 || echo "")
says update.the_rollback_names_the_reason "$bad" "does not import"
if grep -q '"version":"1.1.0"' .amy/plugins/node_modules/@acme/workflow-oncall/package.json; then
  record update.a_bad_version_is_rolled_back 0
else
  record update.a_bad_version_is_rolled_back 1
fi
still=$("$amy" --workflow oncall status --all 2>&1 || echo "")
says update.the_machine_boots_after_the_update "$still" "PAGE-1"

# 6. Every configured profile is mounted before the update is called done.
# A second profile naming a package that is not installed is the machine
# the check exists for: the update refuses with the boot's own refusal,
# rather than leaving a config that finds out from the daemon.
withdraw acme-workflow-oncall-1.2.0.tgz
"$tsx" "$machine" add-afterhours
unbootable=$("$amy" update 2>&1 || echo "")
case "$unbootable" in
  *"does not boot"*"afterhours: @acme/workflow-afterhours: not installed"*)
    record update.a_config_that_stops_booting_fails_the_update 0 ;;
  *) record update.a_config_that_stops_booting_fails_the_update 1 ;;
esac
# The move that landed is rolled back with the refusal, and the machine is
# left on the version that did boot.
if grep -q '"version":"1.1.0"' .amy/plugins/node_modules/@acme/workflow-oncall/package.json; then
  record update.the_boot_refusal_rolls_the_move_back 0
else
  record update.the_boot_refusal_rolls_the_move_back 1
fi
# The broken profile goes, and the machine is whole again for the rest.
"$tsx" "$machine" drop-afterhours

# 7. The update refuses while the loop is running, naming the pid.
printf '{"pid": %s, "workflow": "oncall", "startedAt": "2026-01-01T00:00:00.000Z"}\n' "$$" > .amy/daemon.pid
refused=$("$amy" update 2>&1 || echo "")
printf '%s\n' "$refused" > "$work/release-refused.log"
rm .amy/daemon.pid
says update.an_update_refuses_while_the_loop_runs "$refused" "the loop is running as pid $$"

# 8. Updating the CLI rewrites its skills into the harnesses it wrote to
# before — and never into one it did not. The machine's own HOME carries a
# claude harness and a hermes one; only the first is ever written into,
# which is what the record, not the install list, decides.
mkdir -p "$HOME/.claude" "$HOME/.hermes"
"$amy" skills --harness claude >/dev/null 2>&1 || true
recorded=$(cat "$HOME/.amy/skills-written.json" 2>/dev/null || echo "absent")
case "$recorded" in *"claude"*) record update.skills_writes_are_recorded 0 ;; *) record update.skills_writes_are_recorded 1 ;; esac

# A harness never written to is not written to now, and the one that was
# gets the CLI's own skills, not a guess from what is installed.
"$amy" skills --recorded >/dev/null 2>&1 || true
if [ -f "$HOME/.claude/skills/amy/SKILL.md" ]; then
  record update.the_skills_follow_the_version 0
else
  record update.the_skills_follow_the_version 1
fi
if [ -d "$HOME/.hermes/skills" ]; then
  record update.a_harness_never_written_to_is_not_written_to_now 1
else
  record update.a_harness_never_written_to_is_not_written_to_now 0
fi

# 9. The release. The registry gains the next 0.x minor of every `@amykit/*`
# package, which no caret npm saved can reach. `--check` names it in one
# line, and names the global prefix as the CLI's root; an operator's intent
# that holds the CLI below it is named instead of `nothing to move`.
publish "$work/release-broken/"*.tgz
on_disk() {
  "$tsx" "$machine" release-on-disk "$HOME/.amy/plugins/node_modules" "$work/global/lib/node_modules"
}
only() {
  # only <version>: every first-party copy and manifest entry names it, and
  # both the CLI and the plugin are among them.
  listed=$(on_disk)
  case "$listed" in *"@amykit/cli@$1"*"@amykit/plugin-command-gate@$1"*) ;; *) return 1 ;; esac
  [ -z "$(printf '%s\n' "$listed" | grep -v -- "$1\$" || true)" ]
}
check_release=$("$amy" update --check 2>&1 || echo "")
printf '%s\n' "$check_release" > "$work/release-check.log"
case "$check_release" in
  *"npm's global prefix, $work/global"*"@amykit/cli  $current -> $broken  (install, latest)"*)
    record update.a_global_cli_is_an_install_root 0 ;;
  *) record update.a_global_cli_is_an_install_root 1 ;;
esac
"$tsx" "$machine" set-intent "~$current"
held_below=$("$amy" update --check 2>&1 || echo "")
printf '%s\n' "$held_below" > "$work/release-held-below.log"
"$tsx" "$machine" set-intent
case "$check_release|$held_below" in
  *"release $current -> $broken  (every @amykit/* package, @amykit/cli latest)"*"|"*"held below the release by its registry intent ~$current: $broken is published"*)
    case "$held_below" in *"nothing to move"*) record update.a_check_names_the_release 1 ;; *) record update.a_check_names_the_release 0 ;; esac ;;
  *) record update.a_check_names_the_release 1 ;;
esac

# A release whose plugin refuses to import is not half-installed: every
# move goes back, the global CLI with it, and one version is left on disk —
# the old one.
refused=$("$amy" update 2>&1 || echo "")
printf '%s\n' "$refused" > "$work/release-refused.log"
case "$refused" in
  *"@amykit/plugin-command-gate $broken does not import"*"every move is rolled back"*)
    if only "$current"; then record update.a_refused_release_rolls_back_whole 0; else record update.a_refused_release_rolls_back_whole 1; fi ;;
  *) record update.a_refused_release_rolls_back_whole 1 ;;
esac

# The good release: one `amy update` crosses the minor in both roots, the
# global CLI moves in its prefix and still runs from the path the operator
# types, and its skills are its own. The young workflow's caret holds it at
# 0.1.0 with 0.2.0 published, which a registry answering every range with
# its newest version would have moved.
publish "$work/release-good/"*.tgz
moved=$("$amy" update 2>&1 || echo "")
printf '%s\n' "$moved" > "$work/release-moved.log"
case "$moved" in
  *"updated @amykit/plugin-command-gate"*"updated @amykit/cli"*) record update.a_release_crosses_the_minor 0 ;;
  *) record update.a_release_crosses_the_minor 1 ;;
esac
listed=$(on_disk)
if only "$good" && printf '%s\n' "$listed" | grep -qx "manifest @amykit/plugin-command-gate ^$good"; then
  record update.one_release_on_disk 0
else
  record update.one_release_on_disk 1
fi
young=$("$tsx" "$machine" version "$HOME/.amy/plugins/node_modules/@acme/workflow-young/package.json")
if [ "$young" = "0.1.0" ] && grep -q '"@acme/workflow-young": "\^0.1.0"' "$HOME/.amy/plugins/package.json"; then
  record update.a_third_party_range_is_honoured 0
else
  record update.a_third_party_range_is_honoured 1
fi
cli_version_after=$("$tsx" "$machine" version "$work/global/lib/node_modules/@amykit/cli/package.json")
if [ "$cli_version_after" = "$good" ]; then
  record update.a_global_cli_moves 0
  record update.the_cli_moves_itself 0
else
  record update.a_global_cli_moves 1
  record update.the_cli_moves_itself 1
fi
runs_new=1
if "$amy" --version 2>/dev/null | grep -q -- "$good"; then runs_new=0; fi
record update.a_moved_cli_still_runs "$runs_new"
own_skills=1
if grep -q "provenance: release-$good" "$HOME/.claude/skills/amy/SKILL.md" 2>/dev/null; then own_skills=0; fi
record update.a_moved_cli_rewrites_its_own_skills "$own_skills"
if [ "$runs_new" = 0 ] && [ "$own_skills" = 0 ]; then
  record update.a_moved_global_cli_still_runs 0
else
  record update.a_moved_global_cli_still_runs 1
fi

# 10. Auto-update, running before a workflow, reaches the release the
# command does: the next one is published, and one tick moves everything.
publish "$work/release-later/"*.tgz
"$tsx" "$machine" replace-in-config "timing: after" "timing: before"
printf '{"runs": 0}\n' > .amy/workflows/oncall/auto-update.json
"$amy" --workflow oncall tick >/dev/null 2>&1 || true
if only "$later"; then record update.auto_update_reaches_the_release 0; else record update.auto_update_reaches_the_release 1; fi

failed=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"status":"failed"' || true)
total=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"type"' || true)
status=passed
if [ "$failed" != "0" ]; then status=failed; fi

cat > "$report" <<JSON
{
  "scenario": "amy-update",
  "status": "$status",
  "goal": "I want a machine on the last release, its CLI installed with npm install -g, to run one command and end on the current release in both roots, one version throughout, with its work untouched and the skills in its harnesses describing the CLI that is now installed.",
  "artifact": { "package": "@amykit/cli", "entry": "the amy command npm install -g wrote, run by node", "built_by": "scripts/install.sh, published to a loopback registry" },
  "observed": {
    "assertions_run": $total,
    "assertions_failed": $failed,
    "workflow_updated": "@acme/workflow-oncall",
    "moved_from": "1.0.0",
    "moved_to": "1.1.0",
    "release_from": "$current",
    "release_refused": "$broken",
    "release_reached": "$good",
    "release_reached_by_auto_update": "$later"
  },
  "assertions": [$(printf '%s' "$assertions" | sed 's/,$//')]
}
JSON

echo "$((total - failed))/$total assertions passed"
test "$failed" = "0"

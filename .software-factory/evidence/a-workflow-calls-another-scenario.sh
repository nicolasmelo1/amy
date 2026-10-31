#!/bin/sh
# The `a-workflow-calls-another` gate's scenario, as a repeatable run.
#
# Usage: a-workflow-calls-another-scenario.sh [report-path] [--keep]
#
# Three runs of the installed executable, reported as one:
#
#   - a workflow of somebody's own that calls one copied into it with
#     `amy workflow add --into`, driven until the callee escalates;
#   - the `note-to-plan` scenario, whose pull requests are opened by a call;
#   - the errand's scenario, whose pull requests are opened by the same call.
#
# Nothing here needs a credential and nothing here reaches the internet.
# `--keep` leaves the first run's world on disk to be read.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/a-workflow-calls-another-run.json"}
case "$report" in
  --keep) report="$repo/.software-factory/evidence/a-workflow-calls-another-run.json" ;;
  /*) ;;
  *) report="$PWD/$report" ;;
esac

keep=""
for argument in "$@"; do
  if [ "$argument" = "--keep" ]; then keep="--keep"; fi
done

work=$(mktemp -d)
bin="$work/bin"
cleanup() { rm -rf "$work"; }
trap cleanup EXIT INT TERM
mkdir -p "$bin" "$work/lib" "$work/tarballs"

AMY_INSTALL_LIB="$work/lib" AMY_TARBALLS="$work/tarballs" "$repo/scripts/install.sh" "$bin" >/dev/null
test -x "$bin/amy" || { echo "the installer produced no command" >&2; exit 1; }

status=0
AMY_E2E_TARBALLS="$work/tarballs" "$repo/node_modules/.bin/tsx" "$here/a-workflow-calls-another/drive.ts" "$bin/amy" "$work/calls.json" $keep || status=1
"$here/note-to-plan-scenario.sh" "$work/note-to-plan.json" >/dev/null || status=1
"$here/errand-scenario.sh" "$work/errand.json" >/dev/null || status=1

jq -n --slurpfile calls "$work/calls.json" --slurpfile plans "$work/note-to-plan.json" --slurpfile errands "$work/errand.json" '{
  scenario: "a-workflow-calls-another",
  status: (if ([$calls[0], $plans[0], $errands[0]] | all(.status == "passed")) then "passed" else "failed" end),
  goal: $calls[0].goal,
  artifact: $calls[0].artifact,
  observed: {
    assertions_run: ([$calls[0], $plans[0], $errands[0]] | map(.observed.assertions_run) | add),
    assertions_failed: ([$calls[0], $plans[0], $errands[0]] | map(.observed.assertions_failed) | add),
    runs: { calls: $calls[0].observed, "note-to-plan": $plans[0].observed.transitions, errand: $errands[0].observed.transitions }
  },
  assertions: ($calls[0].assertions + $plans[0].assertions + $errands[0].assertions)
}' > "$report"

jq -e '.status == "passed"' "$report" >/dev/null || status=1
echo "$(jq '.observed.assertions_run - .observed.assertions_failed' "$report")/$(jq '.observed.assertions_run' "$report") assertions passed"
exit "$status"

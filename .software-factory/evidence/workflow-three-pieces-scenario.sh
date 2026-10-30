#!/bin/sh
set -eu

repo=$(cd "$(dirname "$0")/../.." && pwd)
report=${1:-"$repo/.software-factory/evidence/workflow-three-pieces-run.json"}
case "$report" in /*) ;; *) report="$PWD/$report" ;; esac

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
"$repo/.software-factory/evidence/workflow-new-scenario.sh" "$work/workflow-new.json" >/dev/null
"$repo/.software-factory/evidence/note-to-plan-scenario.sh" "$work/note-to-plan.json" >/dev/null

jq -n --slurpfile scaffold "$work/workflow-new.json" --slurpfile shipped "$work/note-to-plan.json" '{
  scenario: "workflow-three-pieces",
  status: (if ($scaffold[0].status == "passed" and $shipped[0].status == "passed") then "passed" else "failed" end),
  goal: "I want one diagram-backed workflow declaration whose decisions and runtime pieces run unchanged after installation, while the shipped lifecycle still retries a refused draft.",
  artifact: { package: "@amykit/core", entry: "defineWorkflow and amy workflow new", built_by: "scripts/install.sh" },
  observed: {
    assertions_run: ($scaffold[0].observed.assertions_run + $shipped[0].observed.assertions_run),
    assertions_failed: ($scaffold[0].observed.assertions_failed + $shipped[0].observed.assertions_failed)
  },
  assertions: ($scaffold[0].assertions + $shipped[0].assertions)
}' > "$report"

jq -e '.status == "passed"' "$report" >/dev/null
echo "$(jq '.observed.assertions_run - .observed.assertions_failed' "$report")/$(jq '.observed.assertions_run' "$report") assertions passed"

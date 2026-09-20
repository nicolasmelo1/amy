#!/bin/sh
set -eu

repo=$(cd "$(dirname "$0")/../.." && pwd)
report=${1:-"$repo/.software-factory/evidence/workflow-new-run.json"}
case "$report" in /*) ;; *) report="$PWD/$report" ;; esac

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/home"
AMY_PACKAGES="@amykit/cli" AMY_INSTALL_LIB="$work/lib" "$repo/scripts/install.sh" "$work/bin" >/dev/null
amy="$work/bin/amy"
export HOME="$work/home"

assertions=""
record() {
  status=failed
  if [ "$2" = "0" ]; then status=passed; fi
  assertions="$assertions{\"type\":\"$1\",\"status\":\"$status\"},"
  if [ "$status" = failed ]; then echo "FAILED $1" >&2; fi
}

"$amy" workflow new oncall >/dev/null
"$amy" workflow check oncall >/dev/null 2>&1
record mine.the_scaffold_runs_before_it_is_edited "$?"

test -f "$work/home/.amy/workflows/oncall/index.js" && \
  grep -q 'workflow: oncall' "$work/home/.amy/config.yaml"
record mine.a_directory_name_is_a_workflow "$?"

(cd "$work/home/.amy/workflows/oncall" && npm pack --dry-run >/dev/null 2>&1)
record mine.the_scaffold_is_a_publishable_package "$?"

entry="$work/home/.amy/workflows/oncall/index.js"
cp "$entry" "$entry.clean"
python3 -c 'import pathlib,sys; p=pathlib.Path(sys.argv[1]); p.write_text(p.read_text().replace(sys.argv[2], sys.argv[3]))' "$entry" '{ kind: "advance", to: "done", effects: [], why: "the work was received" }' '{ kind: "act", effects: [], why: "it keeps trying" }'
if "$amy" workflow check oncall >/dev/null 2>&1; then spinning=1; else spinning=0; fi
record mine.a_workflow_that_spins_is_refused "$spinning"
cp "$entry.clean" "$entry"

python3 -c 'import pathlib,sys; p=pathlib.Path(sys.argv[1]); p.write_text(p.read_text().replace(sys.argv[2], sys.argv[3]))' "$entry" 'states: ["received", "done"]' 'states: ["received", "done", "stranded"]'
if "$amy" workflow check oncall >/dev/null 2>&1; then unreachable=1; else unreachable=0; fi
record mine.a_state_nothing_reaches_is_refused "$unreachable"
cp "$entry.clean" "$entry"

python3 -c 'import pathlib,sys; p=pathlib.Path(sys.argv[1]); p.write_text(p.read_text().replace(sys.argv[2], sys.argv[3]))' "$entry" 'effects: [], why: "the work was received"' 'effects: [{ type: "page" }], why: "the work was received"'
if "$amy" workflow check oncall >/dev/null 2>&1; then missing=1; else missing=0; fi
record mine.an_action_with_no_port_is_refused "$missing"

failed=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"status":"failed"' || true)
total=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"type"' || true)
status=passed
if [ "$failed" != 0 ]; then status=failed; fi
cat > "$report" <<JSON
{
  "scenario": "a-workflow-of-your-own",
  "status": "$status",
  "goal": "I want to describe a private process and receive a workflow I own, not a package I must publish. Prove a bare installed command writes an unedited workflow under its state home, resolves its directory by name, checks its lifecycle, and refuses the failure shapes a workflow author otherwise only discovers at boot.",
  "artifact": { "package": "@amykit/cli", "entry": "amy workflow new and amy workflow check", "built_by": "scripts/install.sh" },
  "observed": { "assertions_run": $total, "assertions_failed": $failed },
  "assertions": [$(printf '%s' "$assertions" | sed 's/,$//')]
}
JSON

echo "$((total - failed))/$total assertions passed"
test "$failed" = 0

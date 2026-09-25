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

test -f "$work/home/.amy/workflows/oncall/index.ts" && \
  grep -q 'workflow: oncall' "$work/home/.amy/config.yaml"
record mine.a_directory_name_is_a_workflow "$?"

# What `npm install` would put there: the core it is typed against and the
# compiler `prepack` runs, so the pack below is the JavaScript that ships.
modules="$work/home/.amy/workflows/oncall/node_modules"
mkdir -p "$modules/@amykit"
ln -s "$repo/packages/core" "$modules/@amykit/core"
ln -s "$repo/node_modules/typescript" "$modules/typescript"
mkdir -p "$modules/.bin" && ln -s ../typescript/bin/tsc "$modules/.bin/tsc"
(cd "$work/home/.amy/workflows/oncall" && npm pack --dry-run 2>&1 | grep -q 'dist/index.js')
record mine.the_scaffold_is_a_publishable_package "$?"
rm -rf "$work/home/.amy/workflows/oncall/dist"

entry="$work/home/.amy/workflows/oncall/index.ts"
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
cp "$entry.clean" "$entry"
rm "$entry.clean"

# The guardrails: the scaffold's own `sf` policy, run by the real binary.
command -v sf >/dev/null || { echo "sf is not on PATH; scripts/setup-dev.sh installs the pinned one" >&2; exit 1; }
workflow="$work/home/.amy/workflows/oncall"
sf check --root "$workflow" >/dev/null 2>&1
record guardrails.the_scaffold_passes_its_own_check "$?"

sf verify --root "$workflow" >/dev/null 2>&1
record guardrails.every_guardrail_fires_on_its_fixture "$?"

refused() {
  printf '%s\n' "$3" > "$workflow/$2"
  if sf check --root "$workflow" --rule "$1" >/dev/null 2>&1; then outcome=1; else outcome=0; fi
  rm "$workflow/$2"
  return "$outcome"
}
refused L6.BRANCH_RESET_LOSES_COMMITS branch.js 'await git("checkout", "-B", branch, "origin/main");'
record guardrails.a_branch_reset_is_refused "$?"

refused L6.EMPTY_FOLD_AGREES_WITH_EVERYTHING approved.js 'export const approved = (approvals) => approvals.every((a) => a.approved);'
record guardrails.an_every_over_nothing_is_refused "$?"

# The scaffold's own fold, now that it is TypeScript `sf` can read.
cp "$entry" "$entry.clean"
python3 -c 'import pathlib,sys; p=pathlib.Path(sys.argv[1]); p.write_text(p.read_text().replace(sys.argv[2], sys.argv[3]))' "$entry" 'apply: (record) => record,' 'apply: (record) => (record.state === "received" ? { ...record, paged: true } : record),'
if sf check --root "$workflow" --rule L6.FOLD_READS_A_MOVED_RECORD >/dev/null 2>&1; then fold=1; else fold=0; fi
record guardrails.a_fold_reading_the_moved_state_is_refused "$fold"
mv "$entry.clean" "$entry"

failed=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"status":"failed"' || true)
total=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"type"' || true)
status=passed
if [ "$failed" != 0 ]; then status=failed; fi
cat > "$report" <<JSON
{
  "scenario": "a-workflow-of-your-own",
  "status": "$status",
  "goal": "I want to describe a private process and receive a workflow I own, not a package I must publish. Prove a bare installed command writes an unedited workflow under its state home, resolves its directory by name, checks its lifecycle, refuses the failure shapes a workflow author otherwise only discovers at boot, and ships the guardrails that make its own sf check refuse the defects that reached a real board.",
  "artifact": { "package": "@amykit/cli", "entry": "amy workflow new and amy workflow check", "built_by": "scripts/install.sh" },
  "observed": { "assertions_run": $total, "assertions_failed": $failed },
  "assertions": [$(printf '%s' "$assertions" | sed 's/,$//')]
}
JSON

echo "$((total - failed))/$total assertions passed"
test "$failed" = 0

#!/bin/sh
# The `bare-install` gate's scenario, as a repeatable run.
#
# Usage: bare-install-scenario.sh [report-path]
#
# Installs only the command onto a machine that has nothing else, and proves
# what the fresh install can and cannot do: no workflow came with it, nothing
# was installed behind the command, every command that needs a workflow says
# so and names what writes one, `amy init` writes its files and installs
# nothing, and `amy doctor` asks the mounted channel whether its target is
# reachable rather than importing one notifier's reader.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

repo=$(cd "$(dirname "$0")/../.." && pwd)
# Absolute before anything else: this scenario changes directory on purpose,
# so a relative report path would be written somewhere nobody looks.
report=${1:-"$repo/.software-factory/evidence/bare-install-run.json"}
case "$report" in /*) ;; *) report="$PWD/$report" ;; esac

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/bin" "$work/home"

# The command and nothing else: the installer would take a package list, and
# the absence of one is the whole point of this run.
AMY_PACKAGES="@amykit/cli" AMY_INSTALL_LIB="$work/lib" \
  "$repo/scripts/install.sh" "$work/bin" >/dev/null
amy="$work/bin/amy"
test -x "$amy" || { echo "the installer produced no command" >&2; exit 1; }

# Nothing of this repository is reachable from here, and this run must not
# touch the real machine's amy home.
export HOME="$work/home"
cd "$work/home"

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

# 1. The command arrives alone: no workflow, no plugin, nothing to drive.
mounted=$("$amy" plugin list 2>&1 || echo "")
says bare.the_command_arrives_alone "$mounted" "no workflow is configured"

workflows=$("$amy" workflow list 2>&1 || echo "")
if [ -n "$(printf '%s' "$workflows" | tr -d '[:space:]')" ]; then
  record bare.nothing_drives_before_somebody_names_one 1
else
  record bare.nothing_drives_before_somebody_names_one 0
fi

# 2. Every command that needs a workflow says so, and names what writes one.
ticked=$("$amy" tick 2>&1 || echo "")
says bare.it_says_what_to_do_instead_of_failing "$ticked" "amy workflow new"
says bare.it_names_the_other_way_to_add_one "$ticked" "amy add"

noted=$("$amy" note "the disk filled up" --repo acme/widgets 2>&1 || echo "")
says bare.a_note_without_a_workflow_is_refused_with_the_fix "$noted" "notes: true"

# 3. `amy init` writes its files and installs nothing. The lib directory is
# checked before and after: whatever npm put there for the command alone is
# what a bare install carries.
before=$(ls "$work/lib/node_modules/@amykit" 2>/dev/null | wc -l | tr -d ' ')

init=$("$amy" init 2>&1 || echo "")
says bare.init_installs_nothing "$init" "kept the plugins it did not need"
if [ ! -f "$work/home/.amy/config.yaml" ] || [ ! -f "$work/home/.amy/roster.yaml" ]; then
  record bare.init_writes_its_files 1
else
  record bare.init_writes_its_files 0
fi

after=$(ls "$work/lib/node_modules/@amykit" 2>/dev/null | wc -l | tr -d ' ')
if [ "$before" = "$after" ]; then
  record bare.init_added_no_package 0
else
  record bare.init_added_no_package 1
fi

# The config `amy init` writes declares nothing: the workflows are examples
# in comments, and the machine drives none of them until one is uncommented
# or written. The parse runs from the install's own directory, so the `yaml`
# the command already carries is what reads the file the command wrote.
declared=$(cd "$work/lib" && node -e "const yaml = require('yaml'); const fs = require('fs'); const p = yaml.parse(fs.readFileSync(process.argv[1],'utf-8')) ?? {}; process.stdout.write(String(Object.keys(p.workflows ?? {}).length));" "$work/home/.amy/config.yaml" 2>/dev/null || echo parse-failed)
if [ "$declared" = "0" ]; then
  record bare.init_writes_no_declared_workflow 0
else
  record bare.init_writes_no_declared_workflow 1
fi

# 4. `amy doctor` on that machine reports and does not crash: the hermes
# target the template names is asked of a channel nothing mounted, which is
# its own answer.
doctored=$("$amy" doctor 2>&1 || echo "")
says bare.doctor_asks_the_port_not_the_package "$doctored" "hermes target"
says bare.doctor_still_reports_what_it_found "$doctored" "config file"

# 5. And with no workflow configured, nothing runs — the refusal is the
# doctor's assembled answer, not a crash.
says bare.no_workflow_mounts_so_nothing_assembles "$doctored" "no workflow is configured"

failed=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"status":"failed"' || true)
total=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"type"' || true)
status=passed
if [ "$failed" != "0" ]; then status=failed; fi

cat > "$report" <<JSON
{
  "scenario": "bare-install",
  "status": "$status",
  "goal": "I am installing amy onto a machine that has none of it, and I want the process I choose, not the processes it brought. Prove installing the command installs no workflow and no plugin, that a machine with nothing configured is told what to run next rather than failed at, that amy init writes its files and adds no package, and that doctor reaches a notification target by asking the mounted channel rather than by carrying a notifier's reader in the command.",
  "artifact": { "package": "@amykit/cli", "entry": "packages installed by npm, run by node", "built_by": "scripts/install.sh" },
  "observed": {
    "assertions_run": $total,
    "assertions_failed": $failed,
    "amy_packages_installed": "$before",
    "amy_packages_after_init": "$after"
  },
  "assertions": [$(printf '%s' "$assertions" | sed 's/,$//')]
}
JSON

echo "$((total - failed))/$total assertions passed"
test "$failed" = "0"
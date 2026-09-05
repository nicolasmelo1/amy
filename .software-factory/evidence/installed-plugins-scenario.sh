#!/bin/sh
# The `installed-plugins` gate's scenario, as a repeatable run.
#
# Usage: installed-plugins-scenario.sh [report-path]
#
# Installs four packages onto a machine that has nothing else, points a
# workflow this repository never shipped at them, and drives it. That is the
# claim in one run: plugins are installed rather than compiled in, a workflow
# is configuration rather than a case in a switch, and neither of those is
# true until a machine that never saw this checkout can do it.
#
# No unit test can say this. Every one of them imports source from inside the
# workspace, where everything resolves whether it was installed or not.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/installed-plugins-run.json"}
case "$report" in /*) ;; *) report="$PWD/$report" ;; esac

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/home"

# What this machine has any use for: a queue, a store, an engine and somewhere
# to be told something. No tracker, no forge, no agent, no gate, and not the
# second workflow this repository ships.
AMY_PACKAGES="@amykit/cli @amykit/plugin-serial-engine @amykit/plugin-notify-fanout @amykit/plugin-notify-inbox" \
  AMY_INSTALL_LIB="$work/lib" "$repo/scripts/install.sh" "$work/bin" >/dev/null
amy="$work/bin/amy"
test -x "$amy" || { echo "the installer produced no command" >&2; exit 1; }

# The third-party workflow, copied out of the repository before it is
# installed. A `file:` dependency npm may link would leave this checkout
# reachable from the install, which is the one thing being disproved.
cp -R "$here/installed-plugins/workflow-oncall" "$work/third-party"
(cd "$work/lib" && npm install --install-links --no-audit --no-fund --loglevel=error \
  "$work/third-party" >/dev/null)

# amy keeps its state in one place per machine, so this run gets its own.
export HOME="$work/home"
cd "$work/home"
mkdir -p .amy/pages
echo "the disk filled up on node 3" > .amy/pages/PAGE-1.txt

cat > .amy/config.yaml <<'YAML'
workflows:
  oncall:
    workflow: "@acme/workflow-oncall"
    plugins:
      - "@acme/workflow-oncall"
      - "@amykit/plugin-file-queue"
      - "@amykit/plugin-file-store"
      - "@amykit/plugin-serial-engine"
      - "@amykit/plugin-notify-fanout"
      - "@amykit/plugin-notify-inbox"
defaultWorkflow: oncall
notify:
  tracker: false
  inbox: true
YAML

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

# 1. The machine carries what it uses, and nothing else.
if [ -d "$work/lib/node_modules/@amykit/plugin-linear" ] ||
   [ -d "$work/lib/node_modules/@amykit/workflow-note-to-plan" ] ||
   [ -d "$work/lib/node_modules/@amykit/plugin-codex" ]; then
  record plugins.a_machine_installs_only_what_it_uses 1
else
  record plugins.a_machine_installs_only_what_it_uses 0
fi

# 2. Everything the config names resolves, with no table naming any of it.
listing=$("$amy" plugin list 2>&1 || echo "")
case "$listing" in
  *FAIL*|*"not installed"*) record plugins.resolve_at_run_time_with_no_table 1 ;;
  *"@amykit/plugin-serial-engine"*) record plugins.resolve_at_run_time_with_no_table 0 ;;
  *) record plugins.resolve_at_run_time_with_no_table 1 ;;
esac
says plugins.a_workflow_from_outside_this_repository_mounts "$listing" "workflow: oncall"
says plugins.the_listing_tells_installed_from_mounted "$listing" "installed but not mounted"

# 3. The engine drives it, knowing nothing about it.
discovered=$("$amy" discover 2>&1 || echo "")
ticked=$("$amy" tick 2>&1 || echo "")
says plugins.the_engine_drives_it_without_knowing_it "$ticked" "paged -> acknowledged"
says plugins.work_it_found_reached_the_queue "$discovered" "queued PAGE-1"

# 4. One directory per profile, so swapping which one runs keeps both.
if [ -f "$work/home/.amy/oncall/records/PAGE-1.json" ] &&
   [ ! -d "$work/home/.amy/ticket-to-qa/records/PAGE-1.json" ]; then
  record plugins.each_workflow_keeps_its_own_state 0
else
  record plugins.each_workflow_keeps_its_own_state 1
fi

# 5. A name nobody declared is refused with the names there were.
unknown=$("$amy" --workflow onkall tick 2>&1 || echo "")
says plugins.an_unknown_workflow_name_lists_the_ones_there_are "$unknown" "oncall"

# 6. A workflow this repository ships and this machine never installed is
# refused by name, at boot, before a piece of work is touched.
shipped=$("$amy" --workflow note-to-plan tick 2>&1 || echo "")
says plugins.a_shipped_workflow_nobody_installed_is_refused_by_name \
  "$shipped" "@amykit/workflow-note-to-plan: not installed"

# 7. And so is a plugin, with what was installed instead.
sed -i.bak 's|      - "@acme/workflow-oncall"|      - "@acme/workflow-oncall"\
      - "@acme/plugin-nowhere"|' .amy/config.yaml
before=$(cat .amy/oncall/records/PAGE-1.json)

refused=$("$amy" tick 2>&1 || echo "")
says plugins.a_missing_plugin_is_refused_at_boot "$refused" "@acme/plugin-nowhere: not installed"
says plugins.the_refusal_names_what_was_installed_instead "$refused" "@acme/workflow-oncall"

if [ "$before" = "$(cat .amy/oncall/records/PAGE-1.json)" ]; then
  record plugins.nothing_is_touched_before_the_refusal 0
else
  record plugins.nothing_is_touched_before_the_refusal 1
fi

failed=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"status":"failed"' || true)
total=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"type"' || true)
status=passed
if [ "$failed" != "0" ]; then status=failed; fi

installed=$(ls "$work/lib/node_modules/@amy" | wc -l | tr -d ' ')

cat > "$report" <<JSON
{
  "scenario": "installed-plugins",
  "status": "$status",
  "goal": "I want to install amy on my work machine with the plugins my work needs, and on an on-call week point it at a workflow I wrote myself that nobody else has. Prove a machine installs only what it uses, that a workflow package this repository never shipped mounts and gets driven by the same engine, that each workflow keeps its own state, and that anything named and not installed is refused by name before a piece of work is touched.",
  "artifact": { "package": "@amykit/cli", "entry": "packages installed by npm, run by node", "built_by": "scripts/install.sh" },
  "observed": {
    "assertions_run": $total,
    "assertions_failed": $failed,
    "amy_packages_installed": $installed,
    "workflow_driven": "@acme/workflow-oncall"
  },
  "assertions": [$(printf '%s' "$assertions" | sed 's/,$//')]
}
JSON

echo "$((total - failed))/$total assertions passed"
test "$failed" = "0"

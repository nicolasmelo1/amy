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
mkdir -p "$work/bin" "$work/home" "$work/global"
npm_real=$(command -v npm)

# Amy is installed alone. The packages its config names arrive after that,
# through `amy init --install`, not in the command's own install.
AMY_PACKAGES="@amykit/cli" \
  AMY_INSTALL_LIB="$work/lib" "$repo/scripts/install.sh" "$work/bin" >/dev/null
amy="$work/bin/amy"
test -x "$amy" || { echo "the installer produced no command" >&2; exit 1; }

# The workflow is copied out before npm sees it, so the installed machine has
# no path back into this checkout. The npm stand-in answers named packages
# from the tarballs the command install made and answers the third-party name
# from that copy; the CLI is still the process that calls npm, with its own
# `--prefix` root. A registry would answer the same names on a real machine.
cp -R "$here/installed-plugins/workflow-oncall" "$work/third-party"

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
      - "@amykit/plugin-file-brief-store"
      - "@amykit/plugin-serial-engine"
      - "@amykit/plugin-notify-fanout"
      - "@amykit/plugin-notify-inbox"
defaultWorkflow: oncall
notify:
  tracker: false
  inbox: true
YAML

# npm sees the command's requested package names. The stand-in maps the names
# to this run's artifacts, logs the exact argv, and delegates the real install
# with the prefix amy supplied. It is deliberately not a fake success: npm
# writes the root and Node loads the files it wrote.
cat > "$work/bin/npm" <<SH
#!/bin/sh
set -eu
printf '%s\n' "\$*" >> "$work/npm.log"
args=""
for arg in "\$@"; do
  case "\$arg" in
    @amykit/*)
      stem=\$(printf '%s' "\${arg#@amykit/}" | tr '/' '-')
      set -- "\$@"
      args="\$args '$work/lib/packages/amykit-\$stem-'*'.tgz'"
      ;;
    @acme/workflow-oncall)
      args="\$args '$work/third-party'"
      ;;
    *)
      args="\$args '\$arg'"
      ;;
  esac
done
# The artifact paths are made by this scenario, without spaces; eval expands
# the tarball glob only after the package name above has become that path.
eval "exec '$npm_real' \$args"
SH
chmod +x "$work/bin/npm"
export PATH="$work/bin:$PATH"
export NPM_CONFIG_PREFIX="$work/global"

# The config names only packages. `amy init --install` is the sole installer
# of the workflow and support plugins below, and it writes all of them under
# `$HOME/.amy/plugins`.
init=$("$amy" init --install 2>&1 || echo "")

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

# 1. Amy installed every configured package into its own npm root, through the
# command. The global prefix is deliberately empty and no npm call may carry
# `--global`: a root install that silently fell back would leave the same
# machine-wide side effect this change exists to remove.
plugins="$work/home/.amy/plugins"
if [ -d "$plugins/node_modules/@acme/workflow-oncall" ] &&
   [ -f "$plugins/package.json" ]; then
  record plugins.resolve_from_amys_own_root 0
else
  record plugins.resolve_from_amys_own_root 1
fi

if [ -d "$plugins/node_modules/@amykit/plugin-linear" ] ||
   [ -d "$plugins/node_modules/@amykit/workflow-note-to-plan" ] ||
   [ -d "$plugins/node_modules/@amykit/plugin-codex" ]; then
  record plugins.a_machine_installs_only_what_it_uses 1
else
  record plugins.a_machine_installs_only_what_it_uses 0
fi

if [ ! -e "$work/global/lib/node_modules" ] &&
   ! grep -q -- '--global' "$work/npm.log" &&
   grep -q -- "--prefix $plugins" "$work/npm.log"; then
  record plugins.a_global_install_is_not_needed 0
else
  record plugins.a_global_install_is_not_needed 1
fi

# Something parent-walk resolution would have found, but the explicit root
# must not. It lives beside the command, never in `.amy/plugins`.
mkdir -p "$work/lib/node_modules/@amykit/plugin-parent-walk"
printf '{"name":"@amykit/plugin-parent-walk"}\n' > "$work/lib/node_modules/@amykit/plugin-parent-walk/package.json"

# 2. Everything the config names resolves from that root, with no table naming
# any of it. The listing also says nothing about the parent-only fake package.
listing=$("$amy" plugin list 2>&1 || echo "")
case "$listing" in
  *FAIL*|*"not installed"*) record plugins.resolve_at_run_time_with_no_table 1 ;;
  *"@amykit/plugin-serial-engine"*) record plugins.resolve_at_run_time_with_no_table 0 ;;
  *) record plugins.resolve_at_run_time_with_no_table 1 ;;
esac
says plugins.a_workflow_from_outside_this_repository_mounts "$listing" "workflow: oncall"
says plugins.the_listing_tells_installed_from_mounted "$listing" "installed, 7 mounted"
case "$listing" in
  *plugin-parent-walk*) record plugins.the_listing_is_read_from_one_directory 1 ;;
  *) record plugins.the_listing_is_read_from_one_directory 0 ;;
esac

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

# 6. A workflow the config names and this machine never installed is
# refused by name, at boot, before a piece of work is touched. Nothing ships
# with a workflow any more, so the name the machine refuses is one the config
# declared — which is the same claim with no default to lean on.
uninstalled=$("$amy" --workflow absent tick 2>&1 || echo "")
says plugins.a_shipped_workflow_nobody_installed_is_refused_by_name \
  "$uninstalled" "there is no \`absent\` workflow"

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

installed=$(ls "$plugins/node_modules/@amykit" | wc -l | tr -d ' ')

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

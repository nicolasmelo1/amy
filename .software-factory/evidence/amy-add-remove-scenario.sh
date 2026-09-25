# The `amy-add-remove` gate's scenario, as a repeatable run.
#
# Usage: amy-add-remove-scenario.sh [report-path]
#
# Installs the command alone, adds one workflow from a path and tarball URL,
# then removes it. The tarball arrives while the path profile remains default,
# so `add` must validate the profile it just wrote. Nothing remains behind.
#
# No unit test can say this. Every one of them resolves source from inside
# the workspace, where every package is resolvable whether it was installed
# or not.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/amy-add-remove-run.json"}
case "$report" in /*) ;; *) report="$PWD/$report" ;; esac

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/home" "$work/global" "$work/not-a-package"
npm_real=$(command -v npm)

# Amy is installed alone. Everything the workflow needs arrives after that,
# through `amy add`, which is the command under test.
AMY_PACKAGES="@amykit/cli" \
  AMY_INSTALL_LIB="$work/lib" "$repo/scripts/install.sh" "$work/bin" >/dev/null
amy="$work/bin/amy"
test -x "$amy" || { echo "the installer produced no command" >&2; exit 1; }

# The workflow is copied out before npm sees it, so the installed machine has
# no path back into this checkout. The npm stand-in answers the third-party
# name from that copy and maps the tarball URL to a real tarball, then delegates
# everything else to the real npm with the prefix amy supplied.
cp -R "$here/amy-add-remove/workflow-oncall" "$work/third-party"
cp -R "$work/third-party" "$work/tarball-workflow"
node -e '
  const fs = require("fs");
  const root = process.argv[1];
  const manifest = JSON.parse(fs.readFileSync(`${root}/package.json`, "utf8"));
  manifest.name = "@acme/workflow-afterhours";
  fs.writeFileSync(`${root}/package.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  const entry = fs.readFileSync(`${root}/index.js`, "utf8").replaceAll("oncall", "afterhours");
  fs.writeFileSync(`${root}/index.js`, entry);
' "$work/tarball-workflow"
mkdir -p "$work/tarballs"
"$npm_real" pack "$work/tarball-workflow" --pack-destination "$work/tarballs" >/dev/null
mkdir -p "$work/plugin-extra"
printf '{"name":"@acme/plugin-extra","type":"module","exports":"./index.js"}\n' \
  > "$work/plugin-extra/package.json"
printf 'export const plugin = { name: "@acme/plugin-extra", version: "0.1.0", register() {} };\n' \
  > "$work/plugin-extra/index.js"

# amy keeps its state in one place per machine, so this run gets its own.
export HOME="$work/home"
cd "$work/home"
mkdir -p .amy/pages
echo "the disk filled up on node 3" > .amy/pages/PAGE-1.txt

cat > "$work/bin/npm" <<SH
#!/bin/sh
set -eu
printf '%s\n' "\$*" >> "$work/npm.log"
args=""
for arg in "\$@"; do
  case "\$arg" in
    @amykit/*)
      stem=\$(printf '%s' "\${arg#@amykit/}" | tr '/' '-')
      args="\$args '$work/lib/packages/amykit-\$stem-'*'.tgz'"
      ;;
    @acme/workflow-oncall)
      args="\$args '$work/third-party'"
      ;;
    @acme/plugin-extra)
      args="\$args '$work/plugin-extra'"
      ;;
    https://example.test/workflow-afterhours.tgz)
      args="\$args '$work/tarballs/'*.tgz"
      ;;
    *)
      args="\$args '\$arg'"
      ;;
  esac
done
# The core every plugin imports is this checkout's, not the last one npm
# would fetch from the registry: a plugin built against an export added since
# would fail to import beside a published copy. Swapped in after npm has
# written the root, so the root's own manifest still names only what the
# command asked for.
prefix=""
previous=""
for arg in "\$@"; do
  if [ "\$previous" = "--prefix" ]; then prefix="\$arg"; fi
  previous="\$arg"
done
# The artifact paths are made by this scenario, without spaces; eval expands
# the tarball glob only after the package name above has become that path.
status=0
eval "'$npm_real' \$args" || status=\$?
core="\$prefix/node_modules/@amykit/core"
if [ "\$status" = 0 ] && [ -n "\$prefix" ] && [ -d "\$core" ]; then
  rm -rf "\$core" && mkdir -p "\$core"
  tar xzf $work/lib/packages/amykit-core-*.tgz -C "\$core" --strip-components=1
fi
exit "\$status"
SH
chmod +x "$work/bin/npm"
export PATH="$work/bin:$PATH"
export NPM_CONFIG_PREFIX="$work/global"

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

# 1. A path that is not a package is refused before anything is run, naming
# the manifest it looked for.
not_a_package=$("$amy" add "$work/not-a-package" 2>&1 || echo "")
says add.a_directory_that_is_not_a_package_is_refused_first "$not_a_package" "is not a package"

# A machine-wide plugin is also valid before the first workflow. Both add and
# remove must work without `selected()` finding a profile that does not exist.
bare_added=$("$amy" add @acme/plugin-extra 2>&1 || echo "")
says add.a_plugin_can_be_added_before_any_workflow "$bare_added" "added @acme/plugin-extra"
bare_removed=$("$amy" remove @acme/plugin-extra 2>&1 || echo "")
says add.a_plugin_can_be_removed_before_any_workflow "$bare_removed" "removed @acme/plugin-extra"
if grep -q "@acme/plugin-extra" .amy/config.yaml; then
  record add.a_bare_plugin_removal_clears_its_extra 1
else
  record add.a_bare_plugin_removal_clears_its_extra 0
fi

# 2. A workflow added from a path: installed, mounted, named a profile, and
# the machine boots — with no config edited by hand.
added_path=$("$amy" add "$work/third-party" 2>&1 || echo "")
says add.a_path_becomes_a_workflow_that_runs "$added_path" "as the workflow \`oncall\`"

profiled=$(grep -c "workflow: \"@acme/workflow-oncall\"" .amy/config.yaml || true)
if [ "$profiled" -ge 1 ] && [ ! -f .amy/oncall/.gitkeep ]; then
  record add.the_profile_is_written_by_the_command 0
else
  record add.the_profile_is_written_by_the_command 1
fi

# 3. The engine drives it, knowing nothing about it, through a profile the
# command invented.
discovered=$("$amy" --workflow oncall discover 2>&1 || echo "")
ticked=$("$amy" --workflow oncall tick 2>&1 || echo "")
says add.the_engine_drives_it_without_knowing_it "$ticked" "paged -> acknowledged"
says add.work_it_found_reached_the_queue "$discovered" "queued PAGE-1"

# 4. A package that mounts as a plugin joins the machine-wide list without
# copying the recommended set into the config. The stand-in resolves its name
# to a third-party package outside amy's root, then real npm installs it.
added_plugin=$("$amy" add @acme/plugin-extra 2>&1 || echo "")
says add.adding_one_plugin_keeps_the_recommendation "$added_plugin" "to every profile"
if grep -q "recommendedFor\|@amykit/plugin-file-queue" .amy/config.yaml; then
  record add.a_plugin_add_writes_one_line 1
else
  record add.a_plugin_add_writes_one_line 0
fi

# 5. Adding the same thing twice is one install and says so. The first add
# produced the profile; the second is answered without touching the root.
root_before=$(cat .amy/plugins/package.json)
again=$("$amy" add "$work/third-party" 2>&1 || echo "")
says add.adding_the_same_thing_twice_is_one_install "$again" "already mounted"

# 6. A URL discovers its direct package name only after npm has installed it.
# `oncall` remains the default, so the command's own dependency and boot
# checks must select the newly written `afterhours` profile rather than the
# profile that was already there.
added_tarball=$("$amy" add "https://example.test/workflow-afterhours.tgz" 2>&1 || echo "")
says add.a_tarball_discovers_the_direct_package "$added_tarball" "added @acme/workflow-afterhours as the workflow \`afterhours\`"
mkdir -p .amy/afterhours/pages
echo "the disk filled up on node 4" > .amy/afterhours/pages/PAGE-2.txt
tarball_discovered=$("$amy" --workflow afterhours discover 2>&1 || echo "")
tarball_ticked=$("$amy" --workflow afterhours tick 2>&1 || echo "")
says add.the_newly_added_profile_is_validated "$tarball_discovered $tarball_ticked" "paged -> acknowledged"

# 7. `amy remove` drops the entry and the package, and keeps every record.
records_before=$(cat .amy/oncall/records/PAGE-1.json 2>/dev/null || echo "absent")
removed=$("$amy" remove @acme/workflow-oncall 2>&1 || echo "")
says add.removing_drops_the_entry "$removed" "removed"
if [ ! -d .amy/plugins/node_modules/@acme/workflow-oncall ]; then
  record add.removing_uninstalls_the_package 0
else
  record add.removing_uninstalls_the_package 1
fi

# 8. And keeps every record, and drives nothing after it.
after=$("$amy" --workflow oncall tick 2>&1 || echo "")
says add.removing_keeps_the_state "$after" "there is no \`oncall\` workflow"
if [ "$records_before" = "$(cat .amy/oncall/records/PAGE-1.json 2>/dev/null || echo absent)" ]; then
  record add.removing_leaves_the_records 0
else
  record add.removing_leaves_the_records 1
fi

# 9. Removing something the machine still needs is refused, naming the action
# that would have no port. A plugin root holds the engine the workflow rides;
# removing it from under a mounted workflow is the refusal, moved to a moment
# somebody can still change their mind.
"$amy" add "@amykit/plugin-serial-engine" >/dev/null 2>&1 || true
config_workflows=$(awk '/^workflows:/{flag=1;next}/^[^ ]/{flag=0}flag' .amy/config.yaml)
cat > .amy/config.yaml <<YAML
workflows:
  oncall:
    workflow: "@acme/workflow-oncall"
    plugins:
      - "@acme/workflow-oncall"
      - "@amykit/plugin-file-queue"
      - "@amykit/plugin-file-store"
      - "@amykit/plugin-serial-engine"
defaultWorkflow: oncall
YAML
refused=$("$amy" remove "@amykit/plugin-serial-engine" 2>&1 || echo "")
says add.a_removal_that_would_not_boot_is_refused "$refused" "unable to boot"

failed=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"status":"failed"' || true)
total=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"type"' || true)
status=passed
if [ "$failed" != "0" ]; then status=failed; fi

cat > "$report" <<JSON
{
  "scenario": "amy-add-remove",
  "status": "$status",
  "goal": "I want to add a workflow somebody else published with one command — a path, a name or a URL in it — and have the next tick move work through the workflow that arrived; and to remove it, with the machine refusing what it would not survive, rather than leaving a half-added entry behind.",
  "artifact": { "package": "@amykit/cli", "entry": "the installed amy command, run by node", "built_by": "scripts/install.sh" },
  "observed": {
    "assertions_run": $total,
    "assertions_failed": $failed,
    "workflow_added": "@acme/workflow-oncall",
    "added_from": ["path", "tarball URL", "a directory that is not a package"]
  },
  "assertions": [$(printf '%s' "$assertions" | sed 's/,$//')]
}
JSON

echo "$((total - failed))/$total assertions passed"
test "$failed" = "0"
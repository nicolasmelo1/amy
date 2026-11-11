#!/bin/sh
# The `a-plugin-of-your-own` gate's scenario, as a repeatable run.
#
# Usage: a-plugin-of-your-own-scenario.sh [report-path]
#
# Installs the command alone onto a scratch machine, installs a published
# workflow that imports a published plugin by name, and drives it from two
# profiles. One profile forks the plugin from its repository; the other keeps
# the published package. The fork is edited, the next boot builds it, and an
# update to the plugin's next release merges that release into the fork and
# keeps the edit.
#
# No unit test can say this: every one of them stands npm in for itself, and
# what a profile root rests on is npm's own `overrides` and `--install-links`.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/a-plugin-of-your-own-run.json"}
case "$report" in /*) ;; *) report="$PWD/$report" ;; esac

# By its physical path: on macOS the temporary directory sits behind `/var`,
# and npm writes a `file:` dependency relative to whichever it was handed.
work=$(cd "$(mktemp -d)" && pwd -P)
cleanup() {
  if [ -z "${AMY_FORK_KEEP_WORK:-}" ]; then rm -rf "$work"; else echo "work kept at $work" >&2; fi
}
trap cleanup EXIT
mkdir -p "$work/bin" "$work/home" "$work/global" "$work/tarballs"
npm_real=$(command -v npm)
tsx="$repo/node_modules/.bin/tsx"

AMY_PACKAGES="@amykit/cli" \
  AMY_INSTALL_LIB="$work/lib" "$repo/scripts/install.sh" "$work/bin" >/dev/null
amy="$work/bin/amy"
test -x "$amy" || { echo "the installer produced no command" >&2; exit 1; }

# The plugin's repository, on this disk: a directory of it per package, a
# commit per release tagged `<name>@<version>`, the way every published
# package here is. The source in it is what npm would ship, compiled from the
# fixture, because a package installed under node_modules cannot be stripped.
upstream="$work/upstream"
"$tsx" "$here/lib/publish.ts" "$here/a-plugin-of-your-own/plugin-pager" "$work/pager-1.0.0"
sed -i.bak "s#\"UPSTREAM\"#\"git+file://$upstream\"#" "$work/pager-1.0.0/package.json" && rm "$work/pager-1.0.0/package.json.bak"
mkdir -p "$upstream/plugins"
cp -R "$work/pager-1.0.0" "$upstream/plugins/pager"
git -C "$upstream" init -q -b main
git -C "$upstream" -c user.email=upstream@example.test -c user.name=upstream add -A
git -C "$upstream" -c user.email=upstream@example.test -c user.name=upstream -c commit.gpgsign=false commit -q -m "release 1.0.0"
git -C "$upstream" -c tag.gpgsign=false tag "@acme/plugin-pager@1.0.0"

# Its next release changes a line the fork will not touch.
cp -R "$work/pager-1.0.0" "$work/pager-1.1.0"
sed -i.bak 's/"version": "1.0.0"/"version": "1.1.0"/' "$work/pager-1.1.0/package.json" && rm "$work/pager-1.1.0/package.json.bak"
printf 'export const since = "1.1.0";\n' >> "$work/pager-1.1.0/index.js"
cp "$work/pager-1.1.0/package.json" "$work/pager-1.1.0/index.js" "$upstream/plugins/pager/"
git -C "$upstream" -c user.email=upstream@example.test -c user.name=upstream add -A
git -C "$upstream" -c user.email=upstream@example.test -c user.name=upstream -c commit.gpgsign=false commit -q -m "release 1.1.0"
git -C "$upstream" -c tag.gpgsign=false tag "@acme/plugin-pager@1.1.0"

for version in 1.0.0 1.1.0; do
  mkdir -p "$work/tarballs/pager-$version"
  "$npm_real" pack "$work/pager-$version" --pack-destination "$work/tarballs/pager-$version" >/dev/null
done
"$tsx" "$here/lib/publish.ts" "$here/a-plugin-of-your-own/workflow-paging" "$work/workflow-paging"

export HOME="$work/home"
cd "$work/home"

# npm, standing in for a registry: the third-party names answer from the
# tarballs above, `@amykit/*` from this checkout's packs, and `view` answers
# the release the scenario published; everything else is the real npm.
core_version=$("$tsx" "$here/lib/core-version.ts")
cat > "$work/bin/npm" <<SH
#!/bin/sh
set -eu
printf '%s\n' "\$*" >> "$work/npm.log"
if [ "\$1" = "view" ]; then
  case "\$2" in
    @acme/plugin-pager@*) echo '"1.1.0"'; exit 0 ;;
    @amykit/*) echo '"$core_version"'; exit 0 ;;
  esac
fi
args=""
for arg in "\$@"; do
  case "\$arg" in
    @amykit/*)
      stem=\$(printf '%s' "\${arg#@amykit/}" | sed 's/@.*//' | tr '/' '-')
      args="\$args '$work/lib/packages/amykit-\$stem-'*'.tgz'"
      ;;
    @acme/plugin-pager@1.1.0)
      args="\$args '$work/tarballs/pager-1.1.0/'*.tgz"
      ;;
    @acme/plugin-pager|@acme/plugin-pager@*)
      args="\$args '$work/tarballs/pager-1.0.0/'*.tgz"
      ;;
    @acme/workflow-paging)
      args="\$args '$work/workflow-paging'"
      ;;
    *)
      args="\$args '\$arg'"
      ;;
  esac
done
# The core every plugin imports is this checkout's, not the one the registry
# would hand out: a plugin built against an export added since would fail to
# import beside a published copy. Swapped in after npm has written the root.
prefix=""
previous=""
for arg in "\$@"; do
  if [ "\$previous" = "--prefix" ]; then prefix="\$arg"; fi
  previous="\$arg"
done
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

# What the workflow read off the pager it imports, under one profile: it
# writes it beside the machine's state on every discovery.
reached() {
  rm -f .amy/pager-said.txt
  "$amy" --workflow "$1" discover >/dev/null 2>&1 || true
  cat .amy/pager-said.txt 2>/dev/null || echo "nothing was read"
}

# The machine's own root holds the published workflow and plugin, the way a
# registry install leaves them: the plugin's range a caret an update can move.
mkdir -p .amy/plugins
printf '{ "name": "amy-plugins", "private": true }\n' > .amy/plugins/package.json
npm install --prefix .amy/plugins --no-audit --no-fund --install-links -- \
  @acme/workflow-paging @acme/plugin-pager @amykit/plugin-file-queue @amykit/plugin-file-store @amykit/plugin-notify-fanout \
  @amykit/plugin-notify-inbox @amykit/plugin-serial-engine >/dev/null 2>&1
node -e '
  const fs = require("node:fs");
  const file = ".amy/plugins/package.json";
  const manifest = JSON.parse(fs.readFileSync(file, "utf-8"));
  manifest.dependencies["@acme/plugin-pager"] = "^1.0.0";
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
'

# Two profiles drive the same published workflow and mount the same names.
cat > .amy/config.yaml <<YAML
workflows:
  published:
    workflow: "@acme/workflow-paging"
    plugins:
      - "@acme/workflow-paging"
      - "@acme/plugin-pager"
      - "@amykit/plugin-file-queue"
      - "@amykit/plugin-file-store"
      - "@amykit/plugin-notify-fanout"
      - "@amykit/plugin-notify-inbox"
      - "@amykit/plugin-serial-engine"
  own:
    workflow: "@acme/workflow-paging"
    plugins:
      - "@acme/workflow-paging"
      - "@acme/plugin-pager"
      - "@amykit/plugin-file-queue"
      - "@amykit/plugin-file-store"
      - "@amykit/plugin-notify-fanout"
      - "@amykit/plugin-notify-inbox"
      - "@amykit/plugin-serial-engine"
defaultWorkflow: published
YAML

# 1. One profile forks the plugin: its source, from its repository, at the
# tag of the version this machine installed.
forked=$("$amy" --workflow own add @acme/plugin-pager --fork 2>&1 || echo "")
says fork.a_package_is_forked_from_its_repository "$forked" "forked @acme/plugin-pager@1.0.0 into $work/home/.amy/profiles/own/forks/plugin-pager"
says fork.the_machine_boots_with_the_fork "$forked" "the machine boots with it"
if [ -n "${AMY_FORK_KEEP_WORK:-}" ]; then printf '%s\n' "$forked" >&2; fi
fork="$work/home/.amy/profiles/own/forks/plugin-pager"

# 2. The profile root holds the fork under the plugin's name, overrides that
# name for what imports it, and holds no core of its own.
if grep -q '"\$@acme/plugin-pager"' .amy/plugins/profiles/own/package.json \
  && [ -d .amy/plugins/profiles/own/node_modules/@acme/workflow-paging ]; then
  record fork.the_profile_root_overrides_the_name 0
else
  record fork.the_profile_root_overrides_the_name 1
fi
if find .amy/plugins/profiles -path '*node_modules/@amykit/core' | grep -q .; then
  record fork.the_profile_root_holds_no_core 1
else
  record fork.the_profile_root_holds_no_core 0
fi

# 3. The person edits the fork. The workflow imports the plugin itself, and
# under the forking profile the next boot builds the fork and the workflow
# reaches it; the other profile still reaches the published package.
sed -i.bak 's/the published pager/the pager this profile owns/' "$fork/index.js" && rm "$fork/index.js.bak"
says fork.an_installed_workflow_reaches_the_fork "$(reached own)" "the pager this profile owns"
says fork.another_profile_keeps_the_published_package "$(reached published)" "the published pager"

# 4. The plugin's next release arrives: the update merges it into the fork,
# keeping the edit, and the machine moves to it.
updated=$("$amy" update 2>&1 || echo "update failed")
says fork.update_merges_the_release_into_the_fork "$updated" "@acme/plugin-pager 1.0.0 → 1.1.0, merged into $fork"
fork_now=$(cat "$fork/index.js")
says fork.update_keeps_the_edit "$fork_now" "the pager this profile owns"
says fork.update_takes_the_release "$fork_now" 'since = "1.1.0"'
says fork.the_merged_fork_mounts "$(reached own)" "the pager this profile owns"

# 5. Removing the fork gives the profile back the published package, and
# never deletes what the person wrote.
removed=$("$amy" --workflow own remove @acme/plugin-pager 2>&1 || echo "")
says fork.removing_a_fork_keeps_its_directory "$removed" "the fork at $fork is yours and stays"
if [ -f "$fork/index.js" ] && [ "$(reached own)" = "the published pager" ]; then
  record fork.removing_a_fork_returns_the_published_package 0
else
  record fork.removing_a_fork_returns_the_published_package 1
fi

failed=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"status":"failed"' || true)
total=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"type"' || true)
status=passed
if [ "$failed" != "0" ]; then status=failed; fi

cat > "$report" <<JSON
{
  "scenario": "a-plugin-of-your-own",
  "status": "$status",
  "goal": "I want two workflows on one machine to answer the same plugin differently — one with the published package, one with a fork of its source I can edit — without either naming a path, and to take the plugin's next release into my fork without losing what I changed.",
  "artifact": { "package": "@amykit/cli", "entry": "the installed amy command, run by node", "built_by": "scripts/install.sh" },
  "observed": {
    "assertions_run": $total,
    "assertions_failed": $failed,
    "forked": "@acme/plugin-pager",
    "profiles": ["published", "own"]
  },
  "assertions": [$(printf '%s' "$assertions" | sed 's/,$//')]
}
JSON

echo "$((total - failed))/$total assertions passed"
test "$failed" = "0"

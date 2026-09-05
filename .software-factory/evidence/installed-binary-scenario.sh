#!/bin/sh
# The `installed-binary` gate's scenario, as a repeatable run.
#
# Usage: installed-binary-scenario.sh [report-path]
#
# Installs amy into a scratch directory and drives it from a working directory
# that contains no checkout, no `node_modules` and no `package.json`. That is
# the claim: what runs is an installed program, not this repository.
#
# The name is older than the design. There is no compiled binary any more —
# what gets installed is packages resolved by node — and the claim underneath
# is the one that survived, so the gate keeps its name and changed its
# assertions.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

repo=$(cd "$(dirname "$0")/../.." && pwd)
# Absolute before anything else: this scenario changes directory on purpose,
# so a relative report path would be written somewhere nobody looks.
report=${1:-"$repo/.software-factory/evidence/installed-binary-run.json"}
case "$report" in /*) ;; *) report="$PWD/$report" ;; esac

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/bin" "$work/home"

AMY_INSTALL_LIB="$work/lib" "$repo/scripts/install.sh" "$work/bin" >/dev/null
amy="$work/bin/amy"
test -x "$amy" || { echo "the installer produced no command" >&2; exit 1; }

# Nothing of this repository is reachable from here. No node_modules to
# resolve a plugin from, no package.json, no checkout. HOME moves with it,
# because amy keeps its state in one place per machine rather than beside
# whoever ran it — and this run must not touch the real one.
export HOME="$work/home"
cd "$work/home"

assertions=""
record() {
  status=failed
  if [ "$2" = "0" ]; then status=passed; fi
  assertions="$assertions{\"type\":\"$1\",\"status\":\"$status\"},"
  if [ "$status" = "failed" ]; then echo "FAILED $1" >&2; fi
}

check() {
  name=$1
  shift
  if "$@" >/dev/null 2>&1; then record "$name" 0; else record "$name" 1; fi
}

# 1. It runs at all, and writes its state where it is run rather than where it
# was built.
version=$("$amy" --version 2>/dev/null || echo "")
check installed.runs_without_a_checkout "$amy" pause "proving the installed command runs"

if [ -f "$work/home/.amy/PAUSED" ]; then
  record installed.keeps_state_in_its_own_home 0
else
  record installed.keeps_state_in_its_own_home 1
fi

# And nowhere else. One install per machine means a command typed in another
# directory has to answer from the same state, not start a second one.
mkdir -p "$work/home/elsewhere"
(cd "$work/home/elsewhere" && "$amy" status >/dev/null 2>&1 || true)
if [ -e "$work/home/elsewhere/.amy" ]; then
  record installed.keeps_nothing_where_you_stand 1
else
  record installed.keeps_nothing_where_you_stand 0
fi
if [ -e "$repo/.amy/STOP" ]; then
  # Writing into the source tree would defeat the whole point: the machine's
  # working directory must not be a repository.
  record installed.does_not_write_into_the_source_tree 1
else
  record installed.does_not_write_into_the_source_tree 0
fi

# 2. Every log line says which build wrote it.
line=$(cat "$work/home"/.amy/log/*.jsonl 2>/dev/null | head -1 || echo "")
built=$(printf '%s' "$line" | sed -n 's/.*"build":"\([^"]*\)".*/\1/p')
if [ -n "$built" ]; then
  record installed.log_line_names_the_build 0
else
  record installed.log_line_names_the_build 1
fi

# 3. The stamp is honest about which tree it came from. A clean tree names a
# version and a commit; a tree with uncommitted work in it says `dev` and
# nothing else, because a release built from work nobody committed would be a
# number that cannot be gone back to.
dirty=no
if ! git -C "$repo" diff --quiet HEAD 2>/dev/null; then dirty=yes; fi

expected="$built"
case "$dirty:$version:$built" in
  yes:*"running from source"*:dev) record installed.says_dev_only_when_it_is_one 0 ;;
  no:*"("*")"*:?*[+]?*) record installed.says_dev_only_when_it_is_one 0 ;;
  *) record installed.says_dev_only_when_it_is_one 1 ;;
esac

# The two spellings differ on purpose: a log line wants one short token
# (`0.1.0+83ef192`) and a person reading `--version` wants prose. So the
# comparison is on the part they must agree about.
agreed=1
case "$built" in
  dev) case "$version" in *"running from source"*) agreed=0 ;; esac ;;
  *) case "$version" in *"${built#*+}"*) agreed=0 ;; esac ;;
esac
record installed.log_build_matches_the_binary "$agreed"

failed=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"status":"failed"' || true)
total=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"type"' || true)
status=passed
if [ "$failed" != "0" ]; then status=failed; fi

cat > "$report" <<JSON
{
  "scenario": "installed-binary",
  "status": "$status",
  "goal": "I do not want my working directory to be this repository, and I do not want the code under test to be different from the code that ships. Prove the installed command runs from a directory with no checkout in it, keeps its state in one place per machine rather than beside whoever ran it, stamps every log line with the build that wrote it, and calls itself a release only when it was built from a tree somebody committed.",
  "artifact": { "package": "@amykit/cli", "entry": "packages installed by npm, run by node", "built_by": "scripts/install.sh" },
  "observed": {
    "assertions_run": $total,
    "assertions_failed": $failed,
    "version": "$version",
    "tree_was_dirty": "$dirty",
    "build_on_log_line": "$expected"
  },
  "assertions": [$(printf '%s' "$assertions" | sed 's/,$//')]
}
JSON

echo "$((total - failed))/$total assertions passed"
test "$failed" = "0"

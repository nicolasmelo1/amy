#!/bin/sh
# The `installed-binary` gate's scenario, as a repeatable run.
#
# Usage: installed-binary-scenario.sh [report-path]
#
# Builds the single executable, installs it into a scratch directory, and
# drives it from a working directory that contains no checkout, no
# `node_modules` and no `package.json`. That is the claim: what runs is an
# installed program, not this repository.
#
# The unit tests cannot make this claim. They import source files from inside
# the workspace, so every one of them passes on a build that carries no
# plugins at all, which is exactly what a bundler produces from a dynamic
# `import(spec)`.
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

"$repo/scripts/install.sh" "$work/bin" >/dev/null
amy="$work/bin/amy"
test -x "$amy" || { echo "the installer produced no executable" >&2; exit 1; }

# Nothing of this repository is reachable from here. No node_modules to
# resolve a plugin from, no package.json, no checkout.
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

# 1. It runs at all, from a directory that knows nothing about the source.
version=$("$amy" --version 2>/dev/null || echo "")
case "$version" in
  *"running from source"*) record installed.reports_a_real_build 1 ;;
  ?*) record installed.reports_a_real_build 0 ;;
  *) record installed.reports_a_real_build 1 ;;
esac

# 2. The stamp names a version and a commit, which is what makes a log line
# joinable to the code that wrote it.
case "$version" in
  *"("*")"*) record installed.stamp_names_version_and_commit 0 ;;
  *) record installed.stamp_names_version_and_commit 1 ;;
esac

# 3. The plugins are inside the binary. This is the assertion the whole phase
# is about: a dynamic import would leave every one of them unresolvable here.
listing=$("$amy" plugin list 2>/dev/null || echo "")
case "$listing" in
  *"could not be imported"*) record installed.plugins_are_inside_the_binary 1 ;;
  *"@amy/plugin-serial-engine"*) record installed.plugins_are_inside_the_binary 0 ;;
  *) record installed.plugins_are_inside_the_binary 1 ;;
esac

# Every entry reports `ok`. The assertion above catches a listing full of
# import errors; this one catches the subtler case of one plugin missing while
# the rest resolve, which is what a half-filled table would produce.
case "$listing" in
  *FAIL*) record installed.every_plugin_resolves 1 ;;
  *) record installed.every_plugin_resolves 0 ;;
esac

count=$(printf '%s' "$listing" | grep -c "  ok   @amy/plugin-" || true)
if [ "$count" -ge 10 ]; then
  record installed.carries_the_whole_default_set 0
else
  record installed.carries_the_whole_default_set 1
fi

# 4. It writes its state where it is run, not where it was built.
check installed.runs_without_a_checkout "$amy" stop "proving the installed binary runs"
if [ -f "$work/home/.amy/STOP" ]; then
  record installed.keeps_state_beside_the_caller 0
else
  record installed.keeps_state_beside_the_caller 1
fi
if [ -e "$repo/.amy/STOP" ]; then
  # Writing into the source tree would defeat the whole point: the machine's
  # working directory must not be a repository.
  record installed.does_not_write_into_the_source_tree 1
else
  record installed.does_not_write_into_the_source_tree 0
fi

# 5. Every log line says which build wrote it.
line=$(cat "$work/home"/.amy/log/*.jsonl 2>/dev/null | head -1 || echo "")
case "$line" in
  *'"build":"dev"'*) record installed.log_line_names_the_build 1 ;;
  *'"build":"'*) record installed.log_line_names_the_build 0 ;;
  *) record installed.log_line_names_the_build 1 ;;
esac

# The two spellings differ on purpose: a log line wants one short token
# (`0.1.0+83ef192`) and a person reading `--version` wants prose. So the
# comparison is on the commit they must agree about.
built=$(printf '%s' "$line" | sed -n 's/.*"build":"\([^"]*\)".*/\1/p')
commit=$(printf '%s' "$built" | sed -n 's/.*+//p')
case "$version" in
  *"$commit"*) record installed.log_build_matches_the_binary 0 ;;
  *) record installed.log_build_matches_the_binary 1 ;;
esac
if [ -n "$commit" ]; then
  record installed.stamp_carries_a_commit 0
else
  record installed.stamp_carries_a_commit 1
fi

# 6. It needs no runtime beside it. A bundled runtime is the reason a single
# file is installable at all.
if [ -z "$(ls -A "$work/bin" | grep -v '^amy$' || true)" ]; then
  record installed.is_one_file 0
else
  record installed.is_one_file 1
fi

failed=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"status":"failed"' || true)
total=$(printf '%s' "$assertions" | tr ',' '\n' | grep -c '"type"' || true)
status=passed
if [ "$failed" != "0" ]; then status=failed; fi

cat > "$report" <<JSON
{
  "scenario": "installed-binary",
  "status": "$status",
  "goal": "I do not want my working directory to be this repository, and I do not want the code under test to be different from the code that ships. Prove the installed executable runs from a directory with no checkout in it, carries its plugins inside itself, keeps state beside the caller rather than in the source tree, and stamps every log line with the build that wrote it.",
  "artifact": { "package": "@amy/cli", "entry": "a single compiled executable", "built_by": "scripts/install.sh" },
  "observed": {
    "assertions_run": $total,
    "assertions_failed": $failed,
    "version": "$version",
    "build_on_log_line": "$built"
  },
  "assertions": [$(printf '%s' "$assertions" | sed 's/,$//')]
}
JSON

echo "$((total - failed))/$total assertions passed"
test "$failed" = "0"
